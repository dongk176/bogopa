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

function parseOptionalIsoLike(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromMs = new Date(value);
    if (!Number.isNaN(fromMs.getTime())) return fromMs.toISOString();
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function inferSubscriptionExpiresAtIso(rawPayload: Record<string, unknown>) {
  return (
    parseOptionalIsoLike(rawPayload.expirationDate) ||
    parseOptionalIsoLike(rawPayload.expiresDate) ||
    parseOptionalIsoLike(rawPayload.expiresAt) ||
    null
  );
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

async function upsertAppleSubscriptionActiveInTx(
  executor: QueryExecutor,
  input: {
    originalTransactionId: string;
    userId: string;
    productId: string;
    transactionId: string;
    expiresAtIso: string | null;
  },
) {
  if (!input.originalTransactionId) return;

  await executor.query(
    `
    INSERT INTO bogopa.apple_subscriptions (
      original_transaction_id,
      user_id,
      product_id,
      status,
      expires_at,
      last_transaction_id,
      last_notification_type,
      last_notification_subtype,
      updated_at
    )
    VALUES ($1, $2, $3, 'active', $4::timestamptz, $5, 'PURCHASE', '', NOW())
    ON CONFLICT (original_transaction_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      product_id = EXCLUDED.product_id,
      status = 'active',
      expires_at = COALESCE(EXCLUDED.expires_at, bogopa.apple_subscriptions.expires_at),
      last_transaction_id = EXCLUDED.last_transaction_id,
      last_notification_type = 'PURCHASE',
      last_notification_subtype = '',
      updated_at = NOW()
    `,
    [
      input.originalTransactionId,
      input.userId,
      input.productId,
      input.expiresAtIso,
      input.transactionId,
    ],
  );
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
  const inferredSubscriptionExpiresAt = inferSubscriptionExpiresAtIso(rawPayload);

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

    const subscriptionOriginalTransactionId = originalTransactionId || transactionId;

    // Prevent sharing one Apple subscription across multiple Bogopa accounts.
    // Allow transfer only when previous owner's subscription is no longer effectively active.
    if (product.key === "memory_pass_monthly" && subscriptionOriginalTransactionId) {
      let blockedByActiveOwner = false;
      let hasAuthoritativeSubscriptionRow = false;

      // Primary source of truth: current subscription state table.
      try {
        const subscriptionOwnerRes = await client.query(
          `
          SELECT
            user_id,
            status,
            expires_at,
            CASE
              WHEN status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) THEN TRUE
              ELSE FALSE
            END AS is_effectively_active
          FROM bogopa.apple_subscriptions
          WHERE original_transaction_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
          `,
          [subscriptionOriginalTransactionId],
        );

        const ownerRow = subscriptionOwnerRes.rows[0] as
          | {
              user_id?: string | null;
              is_effectively_active?: boolean;
            }
          | undefined;
        hasAuthoritativeSubscriptionRow = Boolean(ownerRow);
        const ownerUserId = String(ownerRow?.user_id || "").trim();
        const isEffectivelyActive = Boolean(ownerRow?.is_effectively_active);

        if (ownerUserId && ownerUserId !== userId && isEffectivelyActive) {
          blockedByActiveOwner = true;
        }
      } catch (error: any) {
        if (error?.code !== "42P01") {
          throw error;
        }
      }

      // Fallback: if subscription table is unavailable/outdated, use latest purchase owner
      // and block only when that owner is currently marked active.
      if (!blockedByActiveOwner && !hasAuthoritativeSubscriptionRow) {
        const ownerByOriginalRes = await client.query(
          `
          SELECT user_id
          FROM bogopa.user_iap_purchases
          WHERE product_key = 'memory_pass_monthly'
            AND store_original_transaction_id = $1
            AND user_id <> $2
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [subscriptionOriginalTransactionId, userId],
        );
        const ownerByOriginal = String(ownerByOriginalRes.rows[0]?.user_id || "").trim();

        if (ownerByOriginal) {
          const ownerActiveRes = await client.query(
            `
            SELECT is_memory_pass_active
            FROM bogopa.user_entitlements
            WHERE user_id = $1
            LIMIT 1
            `,
            [ownerByOriginal],
          );
          const ownerIsActive = Boolean(ownerActiveRes.rows[0]?.is_memory_pass_active);
          if (ownerIsActive) {
            blockedByActiveOwner = true;
          }
        }
      }

      if (blockedByActiveOwner) {
        throw new Error("IAP_SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT");
      }
    }

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
        product.key === "memory_pass_monthly" ? subscriptionOriginalTransactionId : originalTransactionId,
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
      if (product.key === "memory_pass_monthly") {
        // Idempotent re-verify can happen when StoreKit returns an already-known transaction.
        // Re-sync subscription snapshot from the latest verified payload so the status is not stale.
        try {
          await upsertAppleSubscriptionActiveInTx(client, {
            originalTransactionId: subscriptionOriginalTransactionId,
            userId,
            productId,
            transactionId,
            expiresAtIso: inferredSubscriptionExpiresAt,
          });
        } catch (error: any) {
          if (error?.code !== "42P01" && error?.code !== "42703") {
            throw error;
          }
        }
      }

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
      try {
        await upsertAppleSubscriptionActiveInTx(client, {
          originalTransactionId: subscriptionOriginalTransactionId,
          userId,
          productId,
          transactionId,
          expiresAtIso: inferredSubscriptionExpiresAt,
        });
      } catch (error: any) {
        if (error?.code !== "42P01" && error?.code !== "42703") {
          throw error;
        }
      }
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
            WHEN unlimited_chat_expires_at IS NULL OR unlimited_chat_expires_at < COALESCE($3::timestamptz, NOW())
              THEN COALESCE($3::timestamptz, NOW()) + make_interval(hours => $2::int)
            ELSE unlimited_chat_expires_at + make_interval(hours => $2::int)
          END,
          updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId, product.unlimitedHours, purchasedAt],
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
