import crypto from "crypto";
import { getDbPool } from "@/lib/server/db";

const CREATE_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS bogopa;`;

const CREATE_MOBILE_AUTH_TRANSFERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS bogopa.mobile_auth_transfers (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  next_path TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let ensureMobileAuthTransfersTablePromise: Promise<void> | null = null;

async function ensureMobileAuthTransfersTable() {
  if (!ensureMobileAuthTransfersTablePromise) {
    ensureMobileAuthTransfersTablePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_SCHEMA_SQL);
      await pool.query(CREATE_MOBILE_AUTH_TRANSFERS_TABLE_SQL);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.mobile_auth_transfers ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.mobile_auth_transfers ADD COLUMN IF NOT EXISTS user_id VARCHAR;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.mobile_auth_transfers ADD COLUMN IF NOT EXISTS next_path TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.mobile_auth_transfers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.mobile_auth_transfers ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ NULL;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.mobile_auth_transfers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_mobile_auth_transfers_expires_at ON bogopa.mobile_auth_transfers (expires_at);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_mobile_auth_transfers_user_id ON bogopa.mobile_auth_transfers (user_id);`);
    })().catch((error) => {
      ensureMobileAuthTransfersTablePromise = null;
      throw error;
    });
  }

  await ensureMobileAuthTransfersTablePromise;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeNextPath(nextPath: string) {
  if (!nextPath.startsWith("/")) return "/step-1";
  if (nextPath.startsWith("/api/")) return "/step-1";
  if (nextPath.startsWith("/auth/")) return "/step-1";
  if (nextPath.startsWith("/signup")) return "/step-1";
  return nextPath;
}

export async function createMobileAuthTransfer(input: { userId: string; nextPath?: string | null; ttlSeconds?: number }) {
  await ensureMobileAuthTransfersTable();
  const pool = getDbPool();

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const ttlSeconds = input.ttlSeconds && input.ttlSeconds > 0 ? input.ttlSeconds : 300;
  const safeNextPath = normalizeNextPath((input.nextPath || "/step-1").trim() || "/step-1");

  await pool.query(
    `
    INSERT INTO bogopa.mobile_auth_transfers (token_hash, user_id, next_path, expires_at)
    VALUES ($1, $2, $3, NOW() + ($4::text || ' seconds')::interval)
    `,
    [tokenHash, input.userId, safeNextPath, String(ttlSeconds)],
  );

  return { token: rawToken, nextPath: safeNextPath };
}

export async function consumeMobileAuthTransfer(rawToken: string): Promise<{ userId: string; nextPath: string } | null> {
  await ensureMobileAuthTransfersTable();
  const pool = getDbPool();
  const tokenHash = hashToken(rawToken);

  const result = await pool.query(
    `
    UPDATE bogopa.mobile_auth_transfers
    SET consumed_at = NOW()
    WHERE token_hash = $1
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING user_id, next_path
    `,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    userId: String(row.user_id),
    nextPath: normalizeNextPath(typeof row.next_path === "string" ? row.next_path : "/step-1"),
  };
}

