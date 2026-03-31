import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getDbPool } from "@/lib/server/db";
import { ensureAttendanceTables } from "@/lib/server/attendance";
import { ensureMemoryPassTables } from "@/lib/server/memory-pass";

type HistoryRow = {
  id: string;
  created_at: string | Date;
  amount: number;
  reason: string;
  detail: Record<string, unknown> | null;
};

function normalizeLimit(input: string | null) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return 60;
  return Math.min(Math.max(Math.floor(parsed), 1), 200);
}

function toIsoDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    await Promise.all([ensureMemoryPassTables(), ensureAttendanceTables()]);
    const pool = getDbPool();

    const url = new URL(request.url);
    const limit = normalizeLimit(url.searchParams.get("limit"));

    const [chargeHistoryRes, usageHistoryRes] = await Promise.all([
      pool.query(
        `
        SELECT *
        FROM (
          SELECT
            CONCAT('txn-', id)::text AS id,
            created_at,
            amount,
            reason,
            detail
          FROM bogopa.user_memory_transactions
          WHERE user_id = $1
            AND transaction_type = 'credit'

          UNION ALL

          SELECT
            CONCAT('att-', id)::text AS id,
            created_at,
            reward_memory AS amount,
            'attendance_reward' AS reason,
            jsonb_build_object(
              'dayInCycle', day_in_cycle,
              'checkDateKst', TO_CHAR(check_date_kst, 'YYYY-MM-DD')
            ) AS detail
          FROM bogopa.user_attendance_logs
          WHERE user_id = $1
        ) h
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [sessionUser.id, limit],
      ),
      pool.query(
        `
        SELECT
          CONCAT('txn-', id)::text AS id,
          created_at,
          amount,
          reason,
          detail
        FROM bogopa.user_memory_transactions
        WHERE user_id = $1
          AND transaction_type = 'debit'
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [sessionUser.id, limit],
      ),
    ]);

    const chargeHistory = (chargeHistoryRes.rows as HistoryRow[]).map((row) => ({
      id: row.id,
      createdAt: toIsoDate(row.created_at),
      amount: Number(row.amount || 0),
      reason: row.reason || "unknown",
      detail: row.detail || {},
    }));

    const usageHistory = (usageHistoryRes.rows as HistoryRow[]).map((row) => ({
      id: row.id,
      createdAt: toIsoDate(row.created_at),
      amount: Number(row.amount || 0),
      reason: row.reason || "unknown",
      detail: row.detail || {},
    }));

    return NextResponse.json({
      ok: true,
      chargeHistory,
      usageHistory,
    });
  } catch (error) {
    console.error("[api-memory-history] failed to fetch history", error);
    return NextResponse.json({ error: "기억 사용 내역을 불러오지 못했습니다." }, { status: 500 });
  }
}
