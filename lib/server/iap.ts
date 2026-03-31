import { IapPlatform, findIapProductByStoreId, getIapCatalog } from "@/lib/iap/catalog";
import { MEMORY_PASS_MONTHLY_GRANT } from "@/lib/memory-pass/config";
import {
  DEFAULT_FREE_MEMORY_BALANCE,
  ensureMemoryPassTables,
  getOrCreateMemoryPassStatus,
  logMemoryTransaction,
} from "@/lib/server/memory-pass";
import { getDbPool } from "@/lib/server/db";

const CREATE_IAP_TABLE_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.user_iap_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  platform VARCHAR(16) NOT NULL CHECK (platform IN ('ios', 'android')),
  product_key VARCHAR(64) NOT NULL,
  store_product_id VARCHAR(128) NOT NULL,
  store_transaction_id VARCHAR(256) NOT NULL,
  store_original_transaction_id VARCHAR(256),
  purchased_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform, store_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_user_iap_purchases_user_created
  ON bogopa.user_iap_purchases (user_id, created_at DESC);
`;

let ensureIapPromise: Promise<void> | null = null;

type QueryExecutor = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type IapCatalogItemForClient = {
  key: string;
  type: "subscription" | "consumable" | "non_consumable";
  title: string;
  storeProductId: string;
};

export type ApplyVerifiedIapPurchaseInput = {
  userId: string;
  platform: IapPlatform;
  productId: string;
  transactionId: string;
  originalTransactionId?: string;
  purchasedAt?: string;
  rawPayload?: Record<string, unknown>;
};

export type ApplyVerifiedIapPurchaseResult = {
  ok: true;
  idempotent: boolean;
  productKey: string;
  memoryBalance: number;
  isSubscribed: boolean;
  isUnlimitedChatActive: boolean;
  unlimitedChatExpiresAt: string | null;
};

function normalizeNonEmpty(value: string | undefined) {
  return (value || "").trim();
}

function parseOptionalDate(value: string | undefined) {
  const trimmed = normalizeNonEmpty(value);
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function ensureUserEntitlementRow(executor: QueryExecutor, userId: string) {
  await executor.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );
}

async function applyMemoryPassMonthlyGrantInTx(
  executor: QueryExecutor,
  userId: string,
) {
  const initialGrantAmount = DEFAULT_FREE_MEMORY_BALANCE + MEMORY_PASS_MONTHLY_GRANT;
  const result = await executor.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id, is_memory_pass_active, memory_balance)
    VALUES ($1, TRUE, $3)
    ON CONFLICT (user_id)
    DO UPDATE SET
      is_memory_pass_active = TRUE,
      memory_balance = bogopa.user_entitlements.memory_balance + $2,
      updated_at = NOW()
    RETURNING memory_balance
    `,
    [userId, MEMORY_PASS_MONTHLY_GRANT, initialGrantAmount],
  );

  await logMemoryTransaction(
    {
      userId,
      transactionType: "credit",
      amount: MEMORY_PASS_MONTHLY_GRANT,
      reason: "memory_pass_monthly_grant",
      detail: {
        source: "iap",
      },
    },
    executor,
  );

  return Number(result.rows[0]?.memory_balance || 0);
}

async function applyMemoryRechargeInTx(
  executor: QueryExecutor,
  input: {
    userId: string;
    amount: number;
    productKey: string;
    platform: IapPlatform;
    productId: string;
    transactionId: string;
  },
) {
  await ensureUserEntitlementRow(executor, input.userId);

  const result = await executor.query(
    `
    UPDATE bogopa.user_entitlements
    SET memory_balance = memory_balance + $2, updated_at = NOW()
    WHERE user_id = $1
    RETURNING memory_balance
    `,
    [input.userId, input.amount],
  );

  await logMemoryTransaction(
    {
      userId: input.userId,
      transactionType: "credit",
      amount: input.amount,
      reason: "memory_recharge",
      detail: {
        source: "iap",
        productKey: input.productKey,
        platform: input.platform,
        productId: input.productId,
        transactionId: input.transactionId,
      },
    },
    executor,
  );

  return Number(result.rows[0]?.memory_balance || 0);
}

export async function ensureIapTables() {
  if (!ensureIapPromise) {
    ensureIapPromise = (async () => {
      await ensureMemoryPassTables();
      const pool = getDbPool();
      await pool.query(CREATE_IAP_TABLE_SQL);
    })().catch((error) => {
      ensureIapPromise = null;
      throw error;
    });
  }
  return ensureIapPromise;
}

export function getIapCatalogForPlatform(platform: IapPlatform): IapCatalogItemForClient[] {
  return getIapCatalog().map((item) => ({
    key: item.key,
    type: item.type,
    title: item.title,
    storeProductId: platform === "ios" ? item.iosProductId : item.androidProductId,
  }));
}

export async function applyVerifiedIapPurchase(
  input: ApplyVerifiedIapPurchaseInput,
): Promise<ApplyVerifiedIapPurchaseResult> {
  const userId = normalizeNonEmpty(input.userId);
  const productId = normalizeNonEmpty(input.productId);
  const transactionId = normalizeNonEmpty(input.transactionId);
  const originalTransactionId = normalizeNonEmpty(input.originalTransactionId);
  const purchasedAt = parseOptionalDate(input.purchasedAt);
  const rawPayload = input.rawPayload || {};

  if (!userId) throw new Error("IAP_USER_ID_REQUIRED");
  if (!productId) throw new Error("IAP_PRODUCT_ID_REQUIRED");
  if (!transactionId) throw new Error("IAP_TRANSACTION_ID_REQUIRED");

  const product = findIapProductByStoreId({
    platform: input.platform,
    productId,
  });
  if (!product) {
    throw new Error("IAP_PRODUCT_NOT_FOUND");
  }

  await ensureIapTables();
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const purchaseRes = await client.query(
      `
      INSERT INTO bogopa.user_iap_purchases (
        user_id,
        platform,
        product_key,
        store_product_id,
        store_transaction_id,
        store_original_transaction_id,
        purchased_at,
        raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7::timestamptz, $8::jsonb)
      ON CONFLICT (platform, store_transaction_id)
      DO UPDATE SET
        store_original_transaction_id = COALESCE(EXCLUDED.store_original_transaction_id, bogopa.user_iap_purchases.store_original_transaction_id),
        purchased_at = COALESCE(EXCLUDED.purchased_at, bogopa.user_iap_purchases.purchased_at),
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING id, user_id, product_key, applied_at
      `,
      [
        userId,
        input.platform,
        product.key,
        productId,
        transactionId,
        originalTransactionId,
        purchasedAt,
        JSON.stringify(rawPayload),
      ],
    );

    const purchaseRow = purchaseRes.rows[0];
    if (!purchaseRow) {
      throw new Error("IAP_PURCHASE_UPSERT_FAILED");
    }

    if (String(purchaseRow.user_id) !== userId) {
      throw new Error("IAP_TRANSACTION_ALREADY_USED");
    }

    if (purchaseRow.applied_at) {
      await client.query("COMMIT");
      const current = await getOrCreateMemoryPassStatus(userId);
      return {
        ok: true,
        idempotent: true,
        productKey: String(purchaseRow.product_key || product.key),
        memoryBalance: current.memoryBalance,
        isSubscribed: current.isSubscribed,
        isUnlimitedChatActive: current.isUnlimitedChatActive,
        unlimitedChatExpiresAt: current.unlimitedChatExpiresAt,
      };
    }

    if (product.key === "memory_pass_monthly") {
      await applyMemoryPassMonthlyGrantInTx(client, userId);
    } else if (product.key === "memory_pack_200" || product.key === "memory_pack_1000" || product.key === "memory_pack_20000") {
      await applyMemoryRechargeInTx(client, {
        userId,
        amount: product.memoryCredit,
        productKey: product.key,
        platform: input.platform,
        productId,
        transactionId,
      });
    } else if (product.key === "unlimited_chat_24h") {
      await client.query(
        `
        INSERT INTO bogopa.user_entitlements (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId],
      );

      await client.query(
        `
        UPDATE bogopa.user_entitlements
        SET
          unlimited_chat_expires_at = CASE
            WHEN unlimited_chat_expires_at IS NULL OR unlimited_chat_expires_at < NOW()
              THEN NOW() + make_interval(hours => $2::int)
            ELSE unlimited_chat_expires_at + make_interval(hours => $2::int)
          END,
          updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId, product.unlimitedHours],
      );
    } else {
      throw new Error("IAP_PRODUCT_UNSUPPORTED");
    }

    await client.query(
      `
      UPDATE bogopa.user_iap_purchases
      SET applied_at = NOW(), updated_at = NOW()
      WHERE id = $1
      `,
      [purchaseRow.id],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const current = await getOrCreateMemoryPassStatus(userId);
  return {
    ok: true,
    idempotent: false,
    productKey: product.key,
    memoryBalance: current.memoryBalance,
    isSubscribed: current.isSubscribed,
    isUnlimitedChatActive: current.isUnlimitedChatActive,
    unlimitedChatExpiresAt: current.unlimitedChatExpiresAt,
  };
}
