import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getKpiTableRows } from "@/lib/server/analytics";

function parseDays(raw: string | null) {
  const parsed = Number(raw || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(365, Math.trunc(parsed)));
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const days = parseDays(request.nextUrl.searchParams.get("days"));
    const rows = await getKpiTableRows(days);
    return NextResponse.json({ ok: true, days, rows });
  } catch (error) {
    console.error("[api-analytics-kpi-table] failed", error);
    return NextResponse.json({ error: "KPI 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}
