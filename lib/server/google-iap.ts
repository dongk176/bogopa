import { IapProduct, IapProductKey, findIapProductByStoreId } from "@/lib/iap/catalog";
import { MEMORY_PASS_MONTHLY_GRANT } from "@/lib/memory-pass/config";
import { getDbPool } from "@/lib/server/db";
import {
  DEFAULT_FREE_MEMORY_BALANCE,
  ensureMemoryPassTables,
  getOrCreateMemoryPassStatus,
  logMemoryTransaction,
} from "@/lib/server/memory-pass";

const CREATE_GOOGLE_IAP_TABLE_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.google_iap_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  product_key VARCHAR(64) NOT NULL,
  store_product_id VARCHAR(128) NOT NULL,
  purchase_token VARCHAR(256) NOT NULL,
  store_transaction_id VARCHAR(256) NOT NULL,
  store_original_transaction_id VARCHAR(256),
  purchased_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'verified',
  acknowledgement_status VARCHAR(32) NOT NULL DEFAULT 'not_required',
  consumption_status VARCHAR(32) NOT NULL DEFAULT 'not_required',
  applied_at TIMESTAMPTZ,
  postprocess_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_transaction_id),
  UNIQUE (purchase_token, store_product_id, product_key)
);

CREATE INDEX IF NOT EXISTS idx_google_iap_purchases_user_created
  ON bogopa.google_iap_purchases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_iap_purchases_purchase_token
  ON bogopa.google_iap_purchases (purchase_token);

CREATE TABLE IF NOT EXISTS bogopa.google_subscriptions (
  purchase_token VARCHAR(256) PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  product_key VARCHAR(64) NOT NULL,
  store_product_id VARCHAR(128) NOT NULL,
  status VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ,
  auto_renewing BOOLEAN,
  acknowledgement_status VARCHAR(64),
  latest_transaction_id VARCHAR(256),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_subscriptions_user_updated
  ON bogopa.google_subscriptions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bogopa.google_notification_events (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(256) UNIQUE,
  purchase_token VARCHAR(256),
  product_id VARCHAR(128),
  notification_type VARCHAR(128),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let ensureGoogleIapPromise: Promise<void> | null = null;

type QueryExecutor = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type ApplyVerifiedGooglePlayPurchaseInput = {
  userId: string;
  productId: string;
  productKey: IapProductKey;
  transactionId: string;
  originalTransactionId?: string;
  purchaseToken: string;
  purchasedAt?: string;
  rawPayload?: Record<string, unknown>;
  acknowledgementStatus?: "not_required" | "pending" | "acknowledged" | "failed";
};

export type ApplyVerifiedGooglePlayPurchaseResult = {
  ok: true;
  idempotent: boolean;
  productKey: string;
  memoryBalance: number;
  isSubscribed: boolean;
  isUnlimitedChatActive: boolean;
  unlimitedChatExpiresAt: string | null;
};

function normalizeNonEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalDate(value: unknown): string | null {
  const normalized = normalizeNonEmpty(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseIsoFromUnknown(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function inferGoogleSubscriptionSnapshot(rawPayload: Record<string, unknown>) {
  const lineItems = Array.isArray(rawPayload.lineItems)
    ? (rawPayload.lineItems as Array<Record<string, unknown>>)
    : [];
  const lineItem = lineItems[0] || null;

  const subscriptionStateRaw = normalizeNonEmpty(rawPayload.subscriptionState);
  const status = subscriptionStateRaw || "SUBSCRIPTION_STATE_ACTIVE";
  const expiresAt =
    parseIsoFromUnknown(lineItem?.expiryTime) ||
    parseIsoFromUnknown(rawPayload.expiresAt) ||
    parseIsoFromUnknown(rawPayload.expirationDate) ||
    null;
  const acknowledgementStatus = normalizeNonEmpty(rawPayload.acknowledgementState) || null;
  const latestTransactionId =
    normalizeNonEmpty(lineItem?.latestSuccessfulOrderId) ||
    normalizeNonEmpty(rawPayload.latestOrderId) ||
    null;
  const autoRenewing = lineItem && typeof lineItem === "object" ? "autoRenewingPlan" in lineItem : null;

  return {
    status,
    expiresAt,
    acknowledgementStatus,
    latestTransactionId,
    autoRenewing: typeof autoRenewing === "boolean" ? autoRenewing : null,
  };
}

function isEffectivelyActiveSubscription(input: { status: string; expiresAt: string | null }) {
  const normalizedStatus = input.status.toUpperCase();
  const activeStates = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"]);
  if (!activeStates.has(normalizedStatus)) return false;
  if (!input.expiresAt) return true;
  return new Date(input.expiresAt).getTime() > Date.now();
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

async function applyMemoryPassMonthlyGrantInTx(executor: QueryExecutor, userId: string) {
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
      detail: { source: "google_iap" },
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
        source: "google_iap",
        productKey: input.productKey,
        productId: input.productId,
        transactionId: input.transactionId,
      },
    },
    executor,
  );

  return Number(result.rows[0]?.memory_balance || 0);
}

async function applyUnlimitedChatGrantInTx(
  executor: QueryExecutor,
  input: { userId: string; purchasedAt: string | null; hours: number },
) {
  await ensureUserEntitlementRow(executor, input.userId);
  await executor.query(
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
    [input.userId, input.hours, input.purchasedAt],
  );
}

export async function ensureGoogleIapTables() {
  if (!ensureGoogleIapPromise) {
    ensureGoogleIapPromise = (async () => {
      await ensureMemoryPassTables();
      const pool = getDbPool();
      await pool.query(CREATE_GOOGLE_IAP_TABLE_SQL);
    })().catch((error) => {
      ensureGoogleIapPromise = null;
      throw error;
    });
  }
  return ensureGoogleIapPromise;
}

function assertAndroidProduct(product: IapProduct | null, productKey: IapProductKey) {
  if (!product) throw new Error("IAP_PRODUCT_NOT_FOUND");
  if (product.key !== productKey) throw new Error("IAP_PRODUCT_KEY_MISMATCH");
  return product;
}

export async function applyVerifiedGooglePlayPurchase(
  input: ApplyVerifiedGooglePlayPurchaseInput,
): Promise<ApplyVerifiedGooglePlayPurchaseResult> {
  const userId = normalizeNonEmpty(input.userId);
  const productId = normalizeNonEmpty(input.productId);
  const purchaseToken = normalizeNonEmpty(input.purchaseToken);
  const transactionId = normalizeNonEmpty(input.transactionId);
  const originalTransactionId = normalizeNonEmpty(input.originalTransactionId) || purchaseToken;
  const purchasedAtIso = normalizeOptionalDate(input.purchasedAt);
  const acknowledgementStatus = normalizeNonEmpty(input.acknowledgementStatus) || "not_required";
  const rawPayload = input.rawPayload || {};

  if (!userId) throw new Error("IAP_USER_ID_REQUIRED");
  if (!productId) throw new Error("IAP_PRODUCT_ID_REQUIRED");
  if (!purchaseToken) throw new Error("ANDROID_PURCHASE_TOKEN_REQUIRED");
  if (!transactionId) throw new Error("IAP_TRANSACTION_ID_REQUIRED");

  const product = assertAndroidProduct(
    findIapProductByStoreId({ platform: "android", productId }),
    input.productKey,
  );

  await ensureGoogleIapTables();
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (product.key === "memory_pass_monthly") {
      const snapshot = inferGoogleSubscriptionSnapshot(rawPayload);
      const ownerRes = await client.query(
        `
        SELECT user_id, status, expires_at
        FROM bogopa.google_subscriptions
        WHERE purchase_token = $1
        LIMIT 1
        `,
        [purchaseToken],
      );
      const ownerRow = ownerRes.rows[0] as
        | { user_id?: string | null; status?: string | null; expires_at?: string | Date | null }
        | undefined;
      const ownerUserId = normalizeNonEmpty(ownerRow?.user_id);
      const ownerStatus = normalizeNonEmpty(ownerRow?.status || snapshot.status);
      const ownerExpiresAt = ownerRow?.expires_at ? new Date(ownerRow.expires_at).toISOString() : snapshot.expiresAt;

      if (ownerUserId && ownerUserId !== userId && isEffectivelyActiveSubscription({ status: ownerStatus, expiresAt: ownerExpiresAt })) {
        throw new Error("IAP_SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT");
      }
    }

    const defaultAckStatus = product.key === "memory_pass_monthly" ? acknowledgementStatus : "not_required";
    const defaultConsumeStatus = product.type === "consumable" ? "pending" : "not_required";

    const purchaseRes = await client.query(
      `
      INSERT INTO bogopa.google_iap_purchases (
        user_id,
        product_key,
        store_product_id,
        purchase_token,
        store_transaction_id,
        store_original_transaction_id,
        purchased_at,
        raw_payload,
        verification_status,
        acknowledgement_status,
        consumption_status
      )
      VALUES (
        $1, $2, $3, $4, $5, NULLIF($6, ''), $7::timestamptz, $8::jsonb, 'verified', $9, $10
      )
      ON CONFLICT (store_transaction_id)
      DO UPDATE SET
        user_id = CASE
          WHEN bogopa.google_iap_purchases.product_key = 'memory_pass_monthly' THEN EXCLUDED.user_id
          ELSE bogopa.google_iap_purchases.user_id
        END,
        purchase_token = EXCLUDED.purchase_token,
        store_original_transaction_id = COALESCE(EXCLUDED.store_original_transaction_id, bogopa.google_iap_purchases.store_original_transaction_id),
        purchased_at = COALESCE(EXCLUDED.purchased_at, bogopa.google_iap_purchases.purchased_at),
        raw_payload = EXCLUDED.raw_payload,
        verification_status = 'verified',
        acknowledgement_status = CASE
          WHEN EXCLUDED.acknowledgement_status = 'not_required' THEN bogopa.google_iap_purchases.acknowledgement_status
          ELSE EXCLUDED.acknowledgement_status
        END,
        consumption_status = CASE
          WHEN EXCLUDED.consumption_status = 'not_required' THEN bogopa.google_iap_purchases.consumption_status
          ELSE EXCLUDED.consumption_status
        END,
        updated_at = NOW()
      RETURNING id, user_id, product_key, applied_at
      `,
      [
        userId,
        product.key,
        productId,
        purchaseToken,
        transactionId,
        originalTransactionId,
        purchasedAtIso,
        JSON.stringify(rawPayload),
        defaultAckStatus,
        defaultConsumeStatus,
      ],
    );

    const purchaseRow = purchaseRes.rows[0] as { id?: number; user_id?: string; applied_at?: string | Date | null } | undefined;
    if (!purchaseRow) throw new Error("IAP_PURCHASE_UPSERT_FAILED");
    if (normalizeNonEmpty(purchaseRow.user_id) !== userId) {
      throw new Error("IAP_TRANSACTION_ALREADY_USED");
    }

    if (purchaseRow.applied_at) {
      if (product.key === "memory_pass_monthly") {
        const snapshot = inferGoogleSubscriptionSnapshot(rawPayload);
        await client.query(
          `
          INSERT INTO bogopa.google_subscriptions (
            purchase_token,
            user_id,
            product_key,
            store_product_id,
            status,
            expires_at,
            auto_renewing,
            acknowledgement_status,
            latest_transaction_id,
            raw_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10::jsonb)
          ON CONFLICT (purchase_token)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            product_key = EXCLUDED.product_key,
            store_product_id = EXCLUDED.store_product_id,
            status = EXCLUDED.status,
            expires_at = COALESCE(EXCLUDED.expires_at, bogopa.google_subscriptions.expires_at),
            auto_renewing = COALESCE(EXCLUDED.auto_renewing, bogopa.google_subscriptions.auto_renewing),
            acknowledgement_status = COALESCE(EXCLUDED.acknowledgement_status, bogopa.google_subscriptions.acknowledgement_status),
            latest_transaction_id = COALESCE(EXCLUDED.latest_transaction_id, bogopa.google_subscriptions.latest_transaction_id),
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()
          `,
          [
            purchaseToken,
            userId,
            product.key,
            productId,
            snapshot.status,
            snapshot.expiresAt,
            snapshot.autoRenewing,
            snapshot.acknowledgementStatus,
            snapshot.latestTransactionId || transactionId,
            JSON.stringify(rawPayload),
          ],
        );
      }

      await client.query("COMMIT");
      const current = await getOrCreateMemoryPassStatus(userId);
      return {
        ok: true,
        idempotent: true,
        productKey: product.key,
        memoryBalance: current.memoryBalance,
        isSubscribed: current.isSubscribed,
        isUnlimitedChatActive: current.isUnlimitedChatActive,
        unlimitedChatExpiresAt: current.unlimitedChatExpiresAt,
      };
    }

    if (product.key === "memory_pass_monthly") {
      await applyMemoryPassMonthlyGrantInTx(client, userId);

      const snapshot = inferGoogleSubscriptionSnapshot(rawPayload);
      await client.query(
        `
        INSERT INTO bogopa.google_subscriptions (
          purchase_token,
          user_id,
          product_key,
          store_product_id,
          status,
          expires_at,
          auto_renewing,
          acknowledgement_status,
          latest_transaction_id,
          raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10::jsonb)
        ON CONFLICT (purchase_token)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          product_key = EXCLUDED.product_key,
          store_product_id = EXCLUDED.store_product_id,
          status = EXCLUDED.status,
          expires_at = COALESCE(EXCLUDED.expires_at, bogopa.google_subscriptions.expires_at),
          auto_renewing = COALESCE(EXCLUDED.auto_renewing, bogopa.google_subscriptions.auto_renewing),
          acknowledgement_status = COALESCE(EXCLUDED.acknowledgement_status, bogopa.google_subscriptions.acknowledgement_status),
          latest_transaction_id = COALESCE(EXCLUDED.latest_transaction_id, bogopa.google_subscriptions.latest_transaction_id),
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
        `,
        [
          purchaseToken,
          userId,
          product.key,
          productId,
          snapshot.status,
          snapshot.expiresAt,
          snapshot.autoRenewing,
          snapshot.acknowledgementStatus || acknowledgementStatus,
          snapshot.latestTransactionId || transactionId,
          JSON.stringify(rawPayload),
        ],
      );
    } else if (product.key === "memory_pack_200" || product.key === "memory_pack_1000" || product.key === "memory_pack_20000") {
      await applyMemoryRechargeInTx(client, {
        userId,
        amount: product.memoryCredit,
        productKey: product.key,
        productId,
        transactionId,
      });
    } else if (product.key === "unlimited_chat_24h") {
      await applyUnlimitedChatGrantInTx(client, {
        userId,
        purchasedAt: purchasedAtIso,
        hours: product.unlimitedHours,
      });
    } else {
      throw new Error("IAP_PRODUCT_UNSUPPORTED");
    }

    await client.query(
      `
      UPDATE bogopa.google_iap_purchases
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

export async function markGooglePurchasePostProcessStatus(input: {
  transactionId: string;
  acknowledgeStatus?: "pending" | "acknowledged" | "failed";
  consumeStatus?: "pending" | "consumed" | "failed";
  postprocessNote?: string;
}) {
  const transactionId = normalizeNonEmpty(input.transactionId);
  if (!transactionId) return;

  await ensureGoogleIapTables();
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE bogopa.google_iap_purchases
    SET
      acknowledgement_status = COALESCE($2, acknowledgement_status),
      consumption_status = COALESCE($3, consumption_status),
      postprocess_note = COALESCE($4, postprocess_note),
      updated_at = NOW()
    WHERE store_transaction_id = $1
    `,
    [
      transactionId,
      input.acknowledgeStatus || null,
      input.consumeStatus || null,
      input.postprocessNote || null,
    ],
  );
}
