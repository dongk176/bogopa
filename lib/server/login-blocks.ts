import { getDbPool } from "@/lib/server/db";

export const ACCOUNT_WITHDRAW_BLOCK_DAYS = 30;

type SqlExecutor = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

type LoginBlockKey = {
  provider: string;
  accountKey: string;
};

const CREATE_LOGIN_BLOCKS_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.user_login_blocks (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(64) NOT NULL,
  account_key VARCHAR(255) NOT NULL,
  blocked_until TIMESTAMPTZ NOT NULL,
  reason VARCHAR(64) NOT NULL DEFAULT 'account_deleted',
  deleted_user_id VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, account_key)
);

CREATE INDEX IF NOT EXISTS idx_user_login_blocks_provider_key
  ON bogopa.user_login_blocks (provider, account_key);

CREATE INDEX IF NOT EXISTS idx_user_login_blocks_blocked_until
  ON bogopa.user_login_blocks (blocked_until DESC);
`;

let ensureLoginBlocksPromise: Promise<void> | null = null;

function normalizeProvider(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAccountKey(value: string) {
  return String(value || "").trim();
}

export function deriveLoginBlockAccountKey(userId: string, provider: string) {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return "";
  if (normalizedProvider === "local-password" && normalizedUserId.startsWith("local:")) {
    return normalizedUserId.slice("local:".length).trim();
  }
  return normalizedUserId;
}

export async function ensureLoginBlocksTable() {
  if (!ensureLoginBlocksPromise) {
    ensureLoginBlocksPromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_LOGIN_BLOCKS_SQL);
    })().catch((error) => {
      ensureLoginBlocksPromise = null;
      throw error;
    });
  }
  await ensureLoginBlocksPromise;
}

export function buildWithdrawBlockedUntil(baseDate = new Date()) {
  const blockedUntil = new Date(baseDate);
  blockedUntil.setDate(blockedUntil.getDate() + ACCOUNT_WITHDRAW_BLOCK_DAYS);
  return blockedUntil;
}

export async function registerLoginBlock(
  input: LoginBlockKey & {
    blockedUntil?: Date;
    reason?: string;
    deletedUserId?: string | null;
  },
  executor?: SqlExecutor,
) {
  const provider = normalizeProvider(input.provider);
  const accountKey = normalizeAccountKey(input.accountKey);
  if (!provider || !accountKey) return;

  await ensureLoginBlocksTable();
  const runner = executor ?? getDbPool();
  const blockedUntil = input.blockedUntil ?? buildWithdrawBlockedUntil();

  await runner.query(
    `
    INSERT INTO bogopa.user_login_blocks (
      provider,
      account_key,
      blocked_until,
      reason,
      deleted_user_id,
      updated_at
    )
    VALUES ($1, $2, $3::timestamptz, $4, $5, NOW())
    ON CONFLICT (provider, account_key) DO UPDATE
    SET blocked_until = GREATEST(bogopa.user_login_blocks.blocked_until, EXCLUDED.blocked_until),
        reason = EXCLUDED.reason,
        deleted_user_id = COALESCE(EXCLUDED.deleted_user_id, bogopa.user_login_blocks.deleted_user_id),
        updated_at = NOW();
    `,
    [
      provider,
      accountKey,
      blockedUntil.toISOString(),
      (input.reason || "account_deleted").trim() || "account_deleted",
      input.deletedUserId || null,
    ],
  );
}

export async function getActiveLoginBlock(
  key: LoginBlockKey,
  executor?: SqlExecutor,
): Promise<{ blockedUntil: string } | null> {
  const provider = normalizeProvider(key.provider);
  const accountKey = normalizeAccountKey(key.accountKey);
  if (!provider || !accountKey) return null;

  await ensureLoginBlocksTable();
  const runner = executor ?? getDbPool();
  const res = await runner.query(
    `
    SELECT blocked_until
    FROM bogopa.user_login_blocks
    WHERE provider = $1
      AND account_key = $2
      AND blocked_until > NOW()
    LIMIT 1
    `,
    [provider, accountKey],
  );

  const raw = res.rows[0]?.blocked_until;
  if (!raw) return null;
  const blockedUntilIso = new Date(String(raw)).toISOString();
  if (Number.isNaN(new Date(blockedUntilIso).getTime())) return null;
  return { blockedUntil: blockedUntilIso };
}

