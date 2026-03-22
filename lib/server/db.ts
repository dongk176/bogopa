import { Pool } from "pg";

function normalizeDatabaseUrl(value: string) {
  if (!value) return value;
  if (!/sslmode=require/i.test(value)) return value;
  if (/uselibpqcompat=/i.test(value)) return value;
  return `${value}${value.includes("?") ? "&" : "?"}uselibpqcompat=true`;
}

const DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL?.trim() || "");
const SHOULD_USE_SSL = /sslmode=require/i.test(DATABASE_URL) || DATABASE_URL.includes("supabase");

declare global {
  var __bogopaPgPool: Pool | undefined;
}

export function isDatabaseConfigured() {
  return Boolean(DATABASE_URL);
}

export function getDbPool() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL이 설정되지 않았습니다.");
  }

  if (!global.__bogopaPgPool) {
    global.__bogopaPgPool = new Pool({
      connectionString: DATABASE_URL,
      max: 5,
      ssl: SHOULD_USE_SSL ? { rejectUnauthorized: false } : undefined,
    });
  }

  return global.__bogopaPgPool;
}
