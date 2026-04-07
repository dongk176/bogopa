import { getDbPool } from "@/lib/server/db";
import { getPlanLimits, MEMORY_PASS_MONTHLY_GRANT, MEMORY_PASS_PRICE_KRW } from "@/lib/memory-pass/config";
import { getIapCatalog } from "@/lib/iap/catalog";

export const DEFAULT_FREE_MEMORY_BALANCE = 60;

const CREATE_MEMORY_PASS_TABLE_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.user_entitlements (
  user_id VARCHAR PRIMARY KEY,
  is_memory_pass_active BOOLEAN NOT NULL DEFAULT FALSE,
  memory_balance INT NOT NULL DEFAULT ${DEFAULT_FREE_MEMORY_BALANCE},
  unlimited_chat_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bogopa.user_entitlements
  ADD COLUMN IF NOT EXISTS unlimited_chat_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS bogopa.user_memory_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  transaction_type VARCHAR(16) NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
  amount INT NOT NULL CHECK (amount > 0),
  reason VARCHAR(64) NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_memory_transactions_user_created
  ON bogopa.user_memory_transactions (user_id, created_at DESC);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureMemoryPassTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_MEMORY_PASS_TABLE_SQL);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

export type MemoryPassStatus = {
  isSubscribed: boolean;
  hasPurchasedMemoryPass: boolean;
  memoryBalance: number;
  isUnlimitedChatActive: boolean;
  unlimitedChatExpiresAt: string | null;
  monthlyPriceKrw: number;
  limits: ReturnType<typeof getPlanLimits>;
};

export type MemoryTransactionType = "credit" | "debit";

export type MemoryTransactionReason =
  | "chat_message"
  | "persona_create"
  | "memory_pass_monthly_grant"
  | "memory_recharge"
  | "unlimited_chat_pass_grant"
  | "manual_adjustment";

type SqlExecutor = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

async function insertMemoryTransaction(
  executor: SqlExecutor,
  input: {
    userId: string;
    transactionType: MemoryTransactionType;
    amount: number;
    reason: MemoryTransactionReason;
    detail?: Record<string, unknown>;
  },
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return;
  await executor.query(
    `
    INSERT INTO bogopa.user_memory_transactions (user_id, transaction_type, amount, reason, detail)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [input.userId, input.transactionType, Math.floor(input.amount), input.reason, JSON.stringify(input.detail || {})],
  );
}

export async function logMemoryTransaction(
  input: {
    userId: string;
    transactionType: MemoryTransactionType;
    amount: number;
    reason: MemoryTransactionReason;
    detail?: Record<string, unknown>;
  },
  executor?: SqlExecutor,
) {
  await ensureMemoryPassTables();
  const queryRunner = executor ?? getDbPool();
  await insertMemoryTransaction(queryRunner, input);
}

export async function getOrCreateMemoryPassStatus(userId: string): Promise<MemoryPassStatus> {
  await ensureMemoryPassTables();
  const pool = getDbPool();

  await pool.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );

  const row = await pool.query(
    `
    SELECT user_id, is_memory_pass_active, memory_balance, unlimited_chat_expires_at
    FROM bogopa.user_entitlements
    WHERE user_id = $1
    `,
    [userId],
  );

  const current = row.rows[0];
  const fallbackIsSubscribed = Boolean(current?.is_memory_pass_active);
  const memoryBalance = Number(current?.memory_balance || 0);
  let isSubscribed = false;
  let syncedFromApple = false;
  let appleTableAvailable = false;

  try {
    const memoryPassProduct = getIapCatalog().find((item) => item.key === "memory_pass_monthly");
    const productIds = Array.from(
      new Set(
        [memoryPassProduct?.iosProductId, memoryPassProduct?.androidProductId]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );

    const subscriptionRes = await pool.query(
      `
      SELECT status, expires_at
      FROM bogopa.apple_subscriptions
      WHERE user_id = $1
        AND (
          COALESCE(array_length($2::text[], 1), 0) = 0
          OR product_id = ANY($2::text[])
        )
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [userId, productIds],
    );
    appleTableAvailable = true;
    const subRow = subscriptionRes.rows[0] as { status?: string; expires_at?: string | Date | null } | undefined;
    if (subRow) {
      syncedFromApple = true;
      const status = String(subRow.status || "").trim().toLowerCase();
      const expiresAtIso = subRow.expires_at ? new Date(subRow.expires_at).toISOString() : null;
      const expiresAtMs = expiresAtIso ? new Date(expiresAtIso).getTime() : null;
      const hasExpiry = typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs);
      const notExpired = !hasExpiry || (expiresAtMs as number) > Date.now();
      isSubscribed = status === "active" && notExpired;
    } else {
      // apple_subscriptions 테이블이 존재하지만 사용자 구독 행이 없으면 미구독으로 본다.
      syncedFromApple = true;
      isSubscribed = false;
    }
  } catch (error: any) {
    if (error?.code !== "42P01") {
      throw error;
    }
  }

  if (!syncedFromApple && !appleTableAvailable) {
    isSubscribed = fallbackIsSubscribed;
  }

  if (fallbackIsSubscribed !== isSubscribed) {
    await pool.query(
      `
      UPDATE bogopa.user_entitlements
      SET is_memory_pass_active = $2, updated_at = NOW()
      WHERE user_id = $1
      `,
      [userId, isSubscribed],
    );
  }

  let hasPurchasedMemoryPass = false;
  try {
    const purchasedRes = await pool.query(
      `
      SELECT EXISTS(
        SELECT 1
        FROM bogopa.user_iap_purchases
        WHERE user_id = $1
          AND product_key = 'memory_pass_monthly'
      ) AS has_purchased
      `,
      [userId],
    );
    hasPurchasedMemoryPass = Boolean(purchasedRes.rows[0]?.has_purchased);
  } catch (error: any) {
    if (error?.code !== "42P01") {
      throw error;
    }
  }
  const unlimitedChatExpiresAtRaw = current?.unlimited_chat_expires_at
    ? new Date(current.unlimited_chat_expires_at).toISOString()
    : null;
  const isUnlimitedChatActive = Boolean(
    unlimitedChatExpiresAtRaw && new Date(unlimitedChatExpiresAtRaw).getTime() > Date.now(),
  );

  return {
    isSubscribed,
    hasPurchasedMemoryPass,
    memoryBalance,
    isUnlimitedChatActive,
    unlimitedChatExpiresAt: unlimitedChatExpiresAtRaw,
    monthlyPriceKrw: MEMORY_PASS_PRICE_KRW,
    limits: getPlanLimits(isSubscribed),
  };
}

export async function consumeMemory(
  userId: string,
  amount: number,
  options?: {
    reason?: MemoryTransactionReason;
    detail?: Record<string, unknown>;
  },
) {
  if (amount <= 0) return { ok: true as const, balance: 0 };

  await ensureMemoryPassTables();
  const pool = getDbPool();

  await pool.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );

  const consumed = await pool.query(
    `
    UPDATE bogopa.user_entitlements
    SET memory_balance = memory_balance - $2, updated_at = NOW()
    WHERE user_id = $1 AND memory_balance >= $2
    RETURNING memory_balance
    `,
    [userId, amount],
  );

  if (consumed.rows.length > 0) {
    await insertMemoryTransaction(pool, {
      userId,
      transactionType: "debit",
      amount,
      reason: options?.reason || "manual_adjustment",
      detail: options?.detail,
    });

    return {
      ok: true as const,
      balance: Number(consumed.rows[0].memory_balance || 0),
    };
  }

  const balanceRes = await pool.query(
    `SELECT memory_balance FROM bogopa.user_entitlements WHERE user_id = $1`,
    [userId],
  );
  return {
    ok: false as const,
    balance: Number(balanceRes.rows[0]?.memory_balance || 0),
  };
}

export async function creditMemory(
  userId: string,
  amount: number,
  options?: {
    reason?: MemoryTransactionReason;
    detail?: Record<string, unknown>;
  },
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    const current = await getOrCreateMemoryPassStatus(userId);
    return {
      ok: true as const,
      balance: current.memoryBalance,
    };
  }

  await ensureMemoryPassTables();
  const pool = getDbPool();

  await pool.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );

  const credited = await pool.query(
    `
    UPDATE bogopa.user_entitlements
    SET memory_balance = memory_balance + $2, updated_at = NOW()
    WHERE user_id = $1
    RETURNING memory_balance
    `,
    [userId, Math.floor(amount)],
  );

  await insertMemoryTransaction(pool, {
    userId,
    transactionType: "credit",
    amount: Math.floor(amount),
    reason: options?.reason || "manual_adjustment",
    detail: options?.detail,
  });

  return {
    ok: true as const,
    balance: Number(credited.rows[0]?.memory_balance || 0),
  };
}

export async function grantUnlimitedChatHours(userId: string, hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) {
    const current = await getOrCreateMemoryPassStatus(userId);
    return {
      ok: true as const,
      isUnlimitedChatActive: current.isUnlimitedChatActive,
      unlimitedChatExpiresAt: current.unlimitedChatExpiresAt,
    };
  }

  await ensureMemoryPassTables();
  const pool = getDbPool();

  await pool.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );

  const res = await pool.query(
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
    RETURNING unlimited_chat_expires_at
    `,
    [userId, Math.floor(hours)],
  );

  const expiresAt = res.rows[0]?.unlimited_chat_expires_at
    ? new Date(res.rows[0].unlimited_chat_expires_at).toISOString()
    : null;

  return {
    ok: true as const,
    isUnlimitedChatActive: Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now()),
    unlimitedChatExpiresAt: expiresAt,
  };
}

export async function hasActiveUnlimitedChat(userId: string) {
  await ensureMemoryPassTables();
  const pool = getDbPool();
  const res = await pool.query(
    `
    SELECT unlimited_chat_expires_at
    FROM bogopa.user_entitlements
    WHERE user_id = $1
    `,
    [userId],
  );

  const expiresAt = res.rows[0]?.unlimited_chat_expires_at
    ? new Date(res.rows[0].unlimited_chat_expires_at).toISOString()
    : null;
  const isActive = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());

  return {
    isActive,
    expiresAt,
  };
}

export async function activateMemoryPass(userId: string) {
  await ensureMemoryPassTables();
  const pool = getDbPool();
  const initialGrantAmount = DEFAULT_FREE_MEMORY_BALANCE + MEMORY_PASS_MONTHLY_GRANT;
  const res = await pool.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id, is_memory_pass_active, memory_balance)
    VALUES ($1, TRUE, $3)
    ON CONFLICT (user_id)
    DO UPDATE SET
      is_memory_pass_active = TRUE,
      memory_balance = bogopa.user_entitlements.memory_balance + $2,
      updated_at = NOW()
    RETURNING is_memory_pass_active, memory_balance
    `,
    [userId, MEMORY_PASS_MONTHLY_GRANT, initialGrantAmount],
  );

  await insertMemoryTransaction(pool, {
    userId,
    transactionType: "credit",
    amount: MEMORY_PASS_MONTHLY_GRANT,
    reason: "memory_pass_monthly_grant",
  });

  return {
    isSubscribed: Boolean(res.rows[0]?.is_memory_pass_active),
    memoryBalance: Number(res.rows[0]?.memory_balance || 0),
  };
}

export async function deactivateMemoryPass(userId: string) {
  await ensureMemoryPassTables();
  const pool = getDbPool();
  const res = await pool.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id, is_memory_pass_active)
    VALUES ($1, FALSE)
    ON CONFLICT (user_id)
    DO UPDATE SET
      is_memory_pass_active = FALSE,
      updated_at = NOW()
    RETURNING is_memory_pass_active, memory_balance
    `,
    [userId],
  );

  return {
    isSubscribed: Boolean(res.rows[0]?.is_memory_pass_active),
    memoryBalance: Number(res.rows[0]?.memory_balance || 0),
  };
}
