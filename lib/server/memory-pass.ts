import { getDbPool } from "@/lib/server/db";
import { getPlanLimits, MEMORY_PASS_MONTHLY_GRANT, MEMORY_PASS_PRICE_KRW } from "@/lib/memory-pass/config";

const DEFAULT_FREE_MEMORY_BALANCE = 60;

const CREATE_MEMORY_PASS_TABLE_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.user_entitlements (
  user_id VARCHAR PRIMARY KEY,
  is_memory_pass_active BOOLEAN NOT NULL DEFAULT FALSE,
  memory_balance INT NOT NULL DEFAULT ${DEFAULT_FREE_MEMORY_BALANCE},
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
  memoryBalance: number;
  monthlyPriceKrw: number;
  limits: ReturnType<typeof getPlanLimits>;
};

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
    SELECT user_id, is_memory_pass_active, memory_balance
    FROM bogopa.user_entitlements
    WHERE user_id = $1
    `,
    [userId],
  );

  const current = row.rows[0];
  const isSubscribed = Boolean(current?.is_memory_pass_active);
  const memoryBalance = Number(current?.memory_balance || 0);

  return {
    isSubscribed,
    memoryBalance,
    monthlyPriceKrw: MEMORY_PASS_PRICE_KRW,
    limits: getPlanLimits(isSubscribed),
  };
}

export async function consumeMemory(userId: string, amount: number) {
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

export async function activateMemoryPass(userId: string) {
  await ensureMemoryPassTables();
  const pool = getDbPool();
  const res = await pool.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id, is_memory_pass_active, memory_balance)
    VALUES ($1, TRUE, ${DEFAULT_FREE_MEMORY_BALANCE + MEMORY_PASS_MONTHLY_GRANT})
    ON CONFLICT (user_id)
    DO UPDATE SET
      is_memory_pass_active = TRUE,
      memory_balance = bogopa.user_entitlements.memory_balance + $2,
      updated_at = NOW()
    RETURNING is_memory_pass_active, memory_balance
    `,
    [userId, MEMORY_PASS_MONTHLY_GRANT],
  );

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
