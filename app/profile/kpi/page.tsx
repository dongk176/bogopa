"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navigation from "@/app/_components/Navigation";

type KpiRow = {
  revisitHourKst: number;
  revisitUsers: number;
  revisitSessions: number;
  d1RetentionPct: number;
  d7RetentionPct: number;
  avgTurnsPerSession: number;
  longSessionRatioPct: number;
  avgUserMessageLength: number;
  memoryInjectionRatePct: number;
  dryStreakUsers: number;
  dryStreakRatePct: number;
  retryRatePct: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  paywallToPurchaseRatePct: number;
  dropoffAfterAiTurnPct: number;
};

function formatPct(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function HourCell({ hour }: { hour: number }) {
  return <>{`${String(hour).padStart(2, "0")}:00`}</>;
}

export default function ProfileKpiPage() {
  const { status } = useSession();
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const response = await fetch(`/api/analytics/kpi-table?days=${days}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data?.error || "KPI 로드 실패"));
        if (cancelled) return;
        setRows(Array.isArray(data?.rows) ? (data.rows as KpiRow[]) : []);
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setError(err instanceof Error ? err.message : "KPI 로드 실패");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [days, status]);

  const summary = useMemo(() => rows[0] || null, [rows]);

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#faf9f5]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f5]">
      <Navigation />
      <main className="mx-auto max-w-[1400px] px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(5.25rem+env(safe-area-inset-top))] lg:pl-72">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/profile")}
            className="rounded-xl border border-[#c7d4dc] bg-white px-3 py-2 text-sm font-semibold text-[#3e5560]"
          >
            뒤로가기
          </button>
          <h1 className="font-headline text-xl font-bold text-[#2f342e]">KPI 테이블</h1>
          <div className="ml-auto flex items-center gap-2">
            {[7, 30, 90].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold ${days === value ? "bg-[#4a626d] text-white" : "bg-white text-[#3e5560] border border-[#c7d4dc]"}`}
              >
                최근 {value}일
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="mb-3 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm font-semibold text-[#8f2f2d]">{error}</p> : null}

        <div className="overflow-x-auto rounded-2xl border border-[#c7d4dc] bg-white">
          <table className="min-w-[1700px] border-collapse text-sm">
            <thead className="bg-[#eef4f8] text-[#3e5560]">
              <tr>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-left">재방문 시각(KST)</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">재방문 사용자</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">재방문 세션</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">D1</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">D7</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">평균 턴/세션</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">10턴+ 세션 비율</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">유저 평균 글자수</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">기억 주입 활성도</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">연속 단답 사용자</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">연속 단답 비율</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">Retry 비율</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">평균 응답(ms)</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">P95 응답(ms)</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">페이월→구매 전환</th>
                <th className="border-b border-[#d9e4ea] px-3 py-2 text-right">AI 응답 후 이탈</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={16} className="px-3 py-8 text-center text-[#72828b]">
                    로딩 중...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-3 py-8 text-center text-[#72828b]">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.revisitHourKst} className="odd:bg-white even:bg-[#fbfdfe]">
                    <td className="border-b border-[#eef3f7] px-3 py-2"><HourCell hour={row.revisitHourKst} /></td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatNumber(row.revisitUsers)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatNumber(row.revisitSessions)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatPct(row.d1RetentionPct)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatPct(row.d7RetentionPct)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{Number(row.avgTurnsPerSession || 0).toFixed(2)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatPct(row.longSessionRatioPct)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{Number(row.avgUserMessageLength || 0).toFixed(2)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatPct(row.memoryInjectionRatePct)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatNumber(row.dryStreakUsers)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatPct(row.dryStreakRatePct)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatPct(row.retryRatePct)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{Number(row.avgResponseTimeMs || 0).toFixed(2)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{Number(row.p95ResponseTimeMs || 0).toFixed(2)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatPct(row.paywallToPurchaseRatePct)}</td>
                    <td className="border-b border-[#eef3f7] px-3 py-2 text-right">{formatPct(row.dropoffAfterAiTurnPct)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {summary ? (
          <p className="mt-2 text-xs text-[#6f7f89]">
            재방문 시각 컬럼만 시간대별로 달라지고, 나머지 KPI 컬럼은 동일 기간(최근 {days}일) 전체 집계값입니다.
          </p>
        ) : null}
      </main>
    </div>
  );
}
