import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getDbPool } from "@/lib/server/db";
import { ensureUsersTable } from "@/lib/server/user-profile";

const CREATE_LOCAL_PASSWORD_ACCOUNTS_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.local_password_accounts (
  login_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_password_accounts_user
  ON bogopa.local_password_accounts (user_id);
`;

const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 64;

let ensureLocalPasswordAccountsPromise: Promise<void> | null = null;

function normalizeLoginId(value: string | null | undefined) {
  return String(value || "").trim();
}

function buildLocalUserId(loginId: string) {
  return `local:${loginId}`;
}

function buildPasswordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function verifyPasswordHash(password: string, encodedHash: string) {
  const parts = String(encodedHash || "").split("$");
  if (parts.length !== 3) return false;
  if (parts[0] !== "scrypt") return false;
  const [, salt, digestHex] = parts;
  if (!salt || !digestHex) return false;

  const expected = Buffer.from(digestHex, "hex");
  const actual = Buffer.from(scryptSync(password, salt, expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function assertValidCredentials(input: { loginId: string; password: string }) {
  if (!LOGIN_ID_PATTERN.test(input.loginId)) {
    throw new Error("LOCAL_ID_INVALID");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH || input.password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("LOCAL_PASSWORD_INVALID");
  }
}

export async function ensureLocalPasswordAccountsTable() {
  if (!ensureLocalPasswordAccountsPromise) {
    ensureLocalPasswordAccountsPromise = (async () => {
      await ensureUsersTable();
      const pool = getDbPool();
      await pool.query(CREATE_LOCAL_PASSWORD_ACCOUNTS_SQL);
    })().catch((error) => {
      ensureLocalPasswordAccountsPromise = null;
      throw error;
    });
  }
  await ensureLocalPasswordAccountsPromise;
}

export async function registerLocalPasswordAccount(input: {
  loginId: string;
  password: string;
}) {
  const loginId = normalizeLoginId(input.loginId);
  const password = String(input.password || "");

  assertValidCredentials({ loginId, password });

  const reservedLoginId = normalizeLoginId(process.env.BOGOPA_LOCAL_LOGIN_ID || "bogopa");
  if (reservedLoginId && loginId === reservedLoginId) {
    throw new Error("LOCAL_ID_RESERVED");
  }

  await ensureLocalPasswordAccountsTable();
  const pool = getDbPool();
  const userId = buildLocalUserId(loginId);
  const passwordHash = buildPasswordHash(password);

  const inserted = await pool.query(
    `
    INSERT INTO bogopa.local_password_accounts (login_id, user_id, password_hash, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (login_id) DO NOTHING
    RETURNING login_id
    `,
    [loginId, userId, passwordHash],
  );

  if (!inserted.rows[0]) {
    throw new Error("LOCAL_ID_ALREADY_EXISTS");
  }

  await pool.query(
    `
    INSERT INTO bogopa."users" ("id", "name", "provider", "profile_completed", "updated_at")
    VALUES ($1, $2, 'local-password', FALSE, NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "provider" = 'local-password',
        "updated_at" = NOW()
    `,
    [userId, loginId],
  );

  return {
    userId,
    loginId,
  };
}

export async function verifyLocalPasswordCredentials(input: {
  loginId: string;
  password: string;
}) {
  const loginId = normalizeLoginId(input.loginId);
  const password = String(input.password || "");
  if (!loginId || !password) return null;

  await ensureLocalPasswordAccountsTable();
  const pool = getDbPool();
  const row = await pool.query(
    `
    SELECT a.user_id, a.password_hash, u.name, u.email, u.image
    FROM bogopa.local_password_accounts a
    LEFT JOIN bogopa."users" u
      ON u.id = a.user_id
    WHERE a.login_id = $1
    LIMIT 1
    `,
    [loginId],
  );

  const account = row.rows[0] as
    | {
        user_id?: string;
        password_hash?: string;
        name?: string;
        email?: string | null;
        image?: string | null;
      }
    | undefined;

  if (!account?.user_id || !account.password_hash) return null;
  if (!verifyPasswordHash(password, account.password_hash)) return null;

  return {
    userId: String(account.user_id),
    name: typeof account.name === "string" && account.name.trim() ? account.name : loginId,
    email: typeof account.email === "string" ? account.email : null,
    image: typeof account.image === "string" ? account.image : null,
  };
}

