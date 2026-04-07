"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

type TopSnapshot = {
  d1RetentionPct: number;
  d7RetentionPct: number;
  paywallToPurchaseRatePct: number;
  dropoffAfterAiTurnPct: number;
};

type ResponseTrendRow = {
  hourKst: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
};

type RevenueSummary = {
  dailyKrw: number;
  weeklyKrw: number;
  monthlyKrw: number;
};

type AdminDashboardPayload = {
  days: number;
  generatedAt: string;
  rows: KpiRow[];
  today: TopSnapshot;
  previousDay: TopSnapshot;
  responseTrend: ResponseTrendRow[];
  revenue: RevenueSummary;
};

const COLORS = {
  ink: "#4a626d",
  primary: "#4a626d",
  primaryDeep: "#3e5661",
  soft: "#cde6f4",
  line: "#9fb7c3",
  good: "#2f8f69",
  bad: "#d8645a",
  warn: "#c7842e",
};

const EMPTY_SUMMARY: KpiRow = {
  revisitHourKst: 0,
  revisitUsers: 0,
  revisitSessions: 0,
  d1RetentionPct: 0,
  d7RetentionPct: 0,
  avgTurnsPerSession: 0,
  longSessionRatioPct: 0,
  avgUserMessageLength: 0,
  memoryInjectionRatePct: 0,
  dryStreakUsers: 0,
  dryStreakRatePct: 0,
  retryRatePct: 0,
  avgResponseTimeMs: 0,
  p95ResponseTimeMs: 0,
  paywallToPurchaseRatePct: 0,
  dropoffAfterAiTurnPct: 0,
};

function formatPct(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatSignedPct(value: number) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(2)}%`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatKrw(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function delta(current: number, previous: number) {
  return Number(current || 0) - Number(previous || 0);
}

function isPositiveDeltaGood(deltaValue: number, lowerIsBetter = false) {
  return lowerIsBetter ? deltaValue < 0 : deltaValue > 0;
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[#a8bcc7] text-[10px] font-bold text-[#6d8390]">
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-[120%] z-20 w-56 -translate-x-1/2 rounded-lg bg-[#23343d] px-2 py-1.5 text-[11px] leading-4 text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

function SectionShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#d6ddd8] bg-white p-4 shadow-[0_12px_24px_rgba(47,52,46,0.08)] md:p-6">
      <header className="mb-4">
        <h2 className="font-headline text-lg font-extrabold tracking-tight text-[#4a626d] md:text-xl">{title}</h2>
        <p className="mt-1 text-xs font-medium text-[#6e858f] md:text-sm">{description}</p>
      </header>
      {children}
    </section>
  );
}

function ScoreCard({
  title,
  value,
  deltaValue,
  help,
  lowerIsBetter = false,
}: {
  title: string;
  value: number;
  deltaValue: number;
  help: string;
  lowerIsBetter?: boolean;
}) {
  const good = isPositiveDeltaGood(deltaValue, lowerIsBetter);
  const trendColor = good ? COLORS.good : COLORS.bad;

  return (
    <article className="rounded-2xl border border-[#d6ddd8] bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-[#4a626d]">{title}</h3>
        <InfoHint text={help} />
      </div>
      <p className="text-3xl font-black tracking-tight text-[#2f342e]">{formatPct(value)}</p>
      <p className="mt-1 text-xs font-semibold" style={{ color: trendColor }}>
        전일 대비 {formatSignedPct(deltaValue)}
      </p>
    </article>
  );
}

function RevenueCard({ title, amount, help }: { title: string; amount: number; help: string }) {
  return (
    <article className="rounded-2xl border border-[#d6ddd8] bg-[#f8fbfd] p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-[#4a626d]">{title}</h3>
        <InfoHint text={help} />
      </div>
      <p className="text-2xl font-black tracking-tight text-[#2f342e]">{formatKrw(amount)}</p>
    </article>
  );
}

export default function AdminPage() {
  const [days, setDays] = useState(30);
  const [payload, setPayload] = useState<AdminDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const response = await fetch(`/api/admin/dashboard?days=${days}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { error?: string } & Partial<AdminDashboardPayload>;
        if (!response.ok) {
          throw new Error(data?.error || "대시보드 데이터를 불러오지 못했습니다.");
        }
        if (!cancelled) {
          setPayload(data as AdminDashboardPayload);
        }
      } catch (err) {
        if (!cancelled) {
          setPayload(null);
          setError(err instanceof Error ? err.message : "대시보드 데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [days]);

  const rows = payload?.rows || [];
  const summary = rows[0] || EMPTY_SUMMARY;
  const today = payload?.today || {
    d1RetentionPct: 0,
    d7RetentionPct: 0,
    paywallToPurchaseRatePct: 0,
    dropoffAfterAiTurnPct: 0,
  };
  const previousDay = payload?.previousDay || {
    d1RetentionPct: 0,
    d7RetentionPct: 0,
    paywallToPurchaseRatePct: 0,
    dropoffAfterAiTurnPct: 0,
  };
  const revenue = payload?.revenue || { dailyKrw: 0, weeklyKrw: 0, monthlyKrw: 0 };

  const trafficData = useMemo(
    () =>
      rows.map((row) => ({
        hour: `${String(row.revisitHourKst).padStart(2, "0")}:00`,
        revisitUsers: row.revisitUsers,
        revisitSessions: row.revisitSessions,
      })),
    [rows],
  );

  const responseTrend = useMemo(
    () =>
      (payload?.responseTrend || []).map((row) => ({
        hour: `${String(row.hourKst).padStart(2, "0")}:00`,
        avg: row.avgResponseTimeMs,
        p95: row.p95ResponseTimeMs,
      })),
    [payload?.responseTrend],
  );

  const longSessionPie = useMemo(
    () => [
      { name: "10턴+", value: summary.longSessionRatioPct, color: COLORS.primary },
      { name: "기타", value: Math.max(0, 100 - summary.longSessionRatioPct), color: "#d7e3ea" },
    ],
    [summary.longSessionRatioPct],
  );

  const avgTurnsProgress = clamp((summary.avgTurnsPerSession / 20) * 100, 0, 100);
  const retryDanger = summary.retryRatePct > 5;

  return (
    <div className="min-h-screen bg-[#faf9f5]">
      <Navigation hideMobileBottomNav />
      <main className="mx-auto max-w-[1500px] px-3 pb-12 pt-[calc(5rem+env(safe-area-inset-top))] md:px-6 lg:pl-72 lg:pr-8">
        <header className="mb-6 rounded-3xl border border-[#d6ddd8] bg-white p-4 shadow-[0_12px_24px_rgba(47,52,46,0.08)] md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-headline text-2xl font-extrabold tracking-tight text-[#4a626d] md:text-3xl">Bogopa Admin Dashboard</h1>
              <p className="mt-1 text-sm font-medium text-[#6e858f]">사용자 행동, 대화 품질, 결제 성과를 한 화면에서 확인</p>
            </div>
            <div className="flex items-center gap-2">
              {[7, 30, 90].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(value)}
                  className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                    days === value
                      ? "bg-[#4a626d] text-white"
                      : "border border-[#d6ddd8] bg-white text-[#4a626d] hover:border-[#4a626d]/40"
                  }`}
                >
                  최근 {value}일
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-[#7b919b]">
            마지막 업데이트: {payload ? new Date(payload.generatedAt).toLocaleString("ko-KR") : "로딩 중"}
          </p>
        </header>

        {error ? (
          <p className="mb-4 rounded-2xl border border-[#efc9c5] bg-[#fff3f2] px-4 py-3 text-sm font-semibold text-[#b84f45]">{error}</p>
        ) : null}

        {loading ? (
          <div className="grid min-h-[40vh] place-items-center rounded-3xl border border-[#d6ddd8] bg-white">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            <SectionShell
              title="1. Top Level Metrics"
              description="핵심 성장/수익 지표와 전일 대비 변화량"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ScoreCard
                  title="D1 리텐션"
                  value={today.d1RetentionPct}
                  deltaValue={delta(today.d1RetentionPct, previousDay.d1RetentionPct)}
                  help="첫 방문 다음 날 재방문 사용자 비율"
                />
                <ScoreCard
                  title="D7 리텐션"
                  value={today.d7RetentionPct}
                  deltaValue={delta(today.d7RetentionPct, previousDay.d7RetentionPct)}
                  help="첫 방문 7일 후 재방문 사용자 비율"
                />
                <ScoreCard
                  title="페이월→구매 전환"
                  value={today.paywallToPurchaseRatePct}
                  deltaValue={delta(today.paywallToPurchaseRatePct, previousDay.paywallToPurchaseRatePct)}
                  help="paywall_view 대비 token_purchased/subscription_started 비율"
                />
                <ScoreCard
                  title="AI 응답 후 이탈률"
                  value={today.dropoffAfterAiTurnPct}
                  deltaValue={delta(today.dropoffAfterAiTurnPct, previousDay.dropoffAfterAiTurnPct)}
                  help="AI 응답 후 1분 내 추가 메시지가 없는 비율"
                  lowerIsBetter
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <RevenueCard
                  title="일 매출"
                  amount={revenue.dailyKrw}
                  help="KST 오늘 기준, 적용 완료(applied_at) 결제 합계"
                />
                <RevenueCard
                  title="주 매출"
                  amount={revenue.weeklyKrw}
                  help="KST 이번 주(월요일 시작) 누적 매출"
                />
                <RevenueCard
                  title="월 매출"
                  amount={revenue.monthlyKrw}
                  help="KST 이번 달 누적 매출"
                />
              </div>
            </SectionShell>

            <SectionShell
              title="2. User Traffic & Engagement Trend"
              description="시간대별 재방문 유저/세션"
            >
              <div className="h-[340px] w-full rounded-2xl border border-[#d6ddd8] bg-white p-2 md:p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trafficData} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5ece8" />
                    <XAxis dataKey="hour" tick={{ fill: COLORS.ink, fontSize: 11 }} interval={1} />
                    <YAxis yAxisId="left" tick={{ fill: COLORS.ink, fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: COLORS.ink, fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(74,98,109,0.06)" }}
                      contentStyle={{ borderRadius: 12, borderColor: "#d6ddd8", fontSize: 12 }}
                    />
                    <Bar yAxisId="right" dataKey="revisitSessions" fill="#d7e3ea" radius={[8, 8, 0, 0]} name="재방문 세션" />
                    <Line yAxisId="left" type="monotone" dataKey="revisitUsers" stroke={COLORS.primaryDeep} strokeWidth={3} dot={false} name="재방문 유저" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </SectionShell>

            <SectionShell
              title="3. Conversation Quality & Immersion"
              description="대화 깊이, 지루함 위험, 페르소나 몰입도"
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                <article className="rounded-2xl border border-[#d6ddd8] bg-white p-4 xl:col-span-2">
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#4a626d]">세션 깊이 게이지</h3>
                    <InfoHint text="평균 턴수와 10턴 이상 세션 비율" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="h-44 rounded-xl border border-[#d6ddd8] bg-[#f8fbfd] p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={longSessionPie} dataKey="value" innerRadius={42} outerRadius={62} startAngle={90} endAngle={-270}>
                            {longSessionPie.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(2)}%`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col justify-center rounded-xl border border-[#d6ddd8] bg-[#f8fbfd] p-4">
                      <p className="text-xs font-semibold text-[#708792]">평균 세션 턴</p>
                      <p className="text-3xl font-black text-[#2d4956]">{summary.avgTurnsPerSession.toFixed(2)}</p>
                      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#dce8ef]">
                        <div className="h-full rounded-full bg-[#4a626d]" style={{ width: `${avgTurnsProgress}%` }} />
                      </div>
                      <p className="mt-2 text-xs font-medium text-[#6f8792]">10턴+ 비율 {formatPct(summary.longSessionRatioPct)}</p>
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-[#f0d4cf] bg-[#fff7f5] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#7a4a40]">연속 단답 위험</h3>
                    <InfoHint text="10자 미만 메시지 3회 연속 발생 유저 비율" />
                  </div>
                  <p className="text-2xl font-black text-[#b03e2a]">{formatPct(summary.dryStreakRatePct)}</p>
                  <p className="text-xs font-semibold text-[#a8604f]">위험 유저 {formatNumber(summary.dryStreakUsers)}명</p>
                  <div className="mt-3 h-20 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ label: "risk", value: summary.dryStreakRatePct }]}>
                        <XAxis dataKey="label" hide />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(2)}%`} />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]} fill={COLORS.warn} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-2xl border border-[#d6ddd8] bg-white p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#4a626d]">페르소나 주입 활성도</h3>
                    <InfoHint text="기억/입버릇/프로필/아바타 입력 비율" />
                  </div>
                  <p className="text-2xl font-black text-[#2f4b58]">{formatPct(summary.memoryInjectionRatePct)}</p>
                  <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#deebf1]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#4a626d] to-[#3e5661]"
                      style={{ width: `${clamp(summary.memoryInjectionRatePct, 0, 100)}%` }}
                    />
                  </div>
                  <div className="mt-4 rounded-xl border border-[#d6ddd8] bg-[#f8fbfd] px-3 py-2">
                    <p className="text-xs font-semibold text-[#69808c]">유저 평균 메시지 길이</p>
                    <p className="text-2xl font-black text-[#274450]">{summary.avgUserMessageLength.toFixed(2)}자</p>
                  </div>
                </article>
              </div>
            </SectionShell>

            <SectionShell
              title="4. System Performance & AI Stability"
              description="응답 속도와 모델 재시도율 모니터링"
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <article className="rounded-2xl border border-[#d6ddd8] bg-white p-4 xl:col-span-2">
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#4a626d]">응답 시간 트렌드 (ms)</h3>
                    <InfoHint text="avg/p95 응답 시간 비교. p95 급등 시 체감 지연 위험" />
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={responseTrend} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5ece8" />
                        <XAxis dataKey="hour" tick={{ fill: COLORS.ink, fontSize: 11 }} interval={1} />
                        <YAxis tick={{ fill: COLORS.ink, fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#d6ddd8", fontSize: 12 }} />
                        <Line type="monotone" dataKey="avg" name="평균 응답" stroke="#4a626d" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="p95" name="P95 응답" stroke="#3e5661" strokeWidth={2.5} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-2xl border border-[#d6ddd8] bg-white p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#4a626d]">모델 Retry 비율</h3>
                    <InfoHint text="message_received 중 retryTriggered=true 비율" />
                  </div>
                  <p className="text-3xl font-black text-[#2f4b58]">{formatPct(summary.retryRatePct)}</p>
                  <p className="mt-1 text-xs font-medium text-[#6d8390]">기준치: 5.00% 이하</p>

                  <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#dce8ee]">
                    <div
                      className={`${retryDanger ? "animate-pulse bg-[#d8645a]" : "bg-[#2f8f69]"} h-full rounded-full`}
                      style={{ width: `${clamp(summary.retryRatePct, 0, 100)}%` }}
                    />
                  </div>

                  <div className={`mt-4 rounded-xl border px-3 py-2 text-sm font-semibold ${retryDanger ? "border-[#f6c1c1] bg-[#fff1f1] text-[#b63333]" : "border-[#cde7db] bg-[#f1fbf6] text-[#1f8b5b]"}`}>
                    {retryDanger ? "경고: 모델 안정성 점검 필요" : "정상: 안정 범위 내"}
                  </div>

                  <dl className="mt-4 grid grid-cols-1 gap-2 text-sm">
                    <div className="rounded-lg bg-[#f8fbfd] px-3 py-2">
                      <dt className="text-xs font-semibold text-[#6d8390]">평균 응답</dt>
                      <dd className="font-bold text-[#2b4652]">{summary.avgResponseTimeMs.toFixed(0)} ms</dd>
                    </div>
                    <div className="rounded-lg bg-[#f8fbfd] px-3 py-2">
                      <dt className="text-xs font-semibold text-[#6d8390]">P95 응답</dt>
                      <dd className="font-bold text-[#2b4652]">{summary.p95ResponseTimeMs.toFixed(0)} ms</dd>
                    </div>
                  </dl>
                </article>
              </div>
            </SectionShell>
          </div>
        )}
      </main>
    </div>
  );
}
