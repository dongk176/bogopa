"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navigation from "@/app/_components/Navigation";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";

type MemoryHistoryItem = {
  id: string;
  createdAt: string;
  amount: number;
  reason: string;
  detail?: Record<string, unknown>;
};

type MemoryHistoryResponse = {
  ok?: boolean;
  chargeHistory?: MemoryHistoryItem[];
  usageHistory?: MemoryHistoryItem[];
  error?: string;
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function describeHistoryItem(item: MemoryHistoryItem, mode: "charge" | "usage") {
  if (item.reason === "attendance_reward") {
    const day = Number(item.detail?.dayInCycle || 0);
    return day > 0 ? `출석체크 ${day}일차 보상` : "출석체크 보상";
  }
  if (item.reason === "memory_pass_monthly_grant") return "기억 패스 월 지급";
  if (item.reason === "memory_recharge") return "기억 충전";
  if (item.reason === "persona_create") return "새 기억 생성";
  if (item.reason === "chat_message") return "대화 전송";
  if (mode === "charge") return "기억 지급";
  return "기억 사용";
}

function AmountBadge({ amount, mode }: { amount: number; mode: "charge" | "usage" }) {
  const isCharge = mode === "charge";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold ${
        isCharge ? "bg-[#17423e] text-[#f8fbff]" : "bg-[#452c2c] text-[#f8fbff]"
      }`}
    >
      {isCharge ? "+" : "-"}
      {Math.max(Number(amount || 0), 0)} 기억
    </span>
  );
}

export default function MemoryHistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"charge" | "usage">("charge");
  const [chargeHistory, setChargeHistory] = useState<MemoryHistoryItem[]>([]);
  const [usageHistory, setUsageHistory] = useState<MemoryHistoryItem[]>([]);

  useNativeSwipeBack(() => {
    router.push("/profile");
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const response = await fetch("/api/memory-history?limit=100", { cache: "no-store" });
        const payload = (await response.json()) as MemoryHistoryResponse;
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          setError(payload.error || "기억 사용 내역을 불러오지 못했습니다.");
          setChargeHistory([]);
          setUsageHistory([]);
          return;
        }
        setChargeHistory(payload.chargeHistory || []);
        setUsageHistory(payload.usageHistory || []);
      } catch {
        if (cancelled) return;
        setError("기억 사용 내역을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const visibleItems = useMemo(
    () => (activeTab === "charge" ? chargeHistory : usageHistory),
    [activeTab, chargeHistory, usageHistory],
  );

  if (status === "loading" || isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#242926]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7fa4b6] border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#242926] text-[#f0f5f2]">
      <Navigation />

      <nav className="fixed top-0 left-0 z-30 w-full border-b border-white/5 bg-[#242926]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="relative mx-auto flex h-16 w-full items-center px-3 md:px-4 lg:px-10">
          <Link
            href="/profile"
            className="inline-flex items-center justify-center rounded-xl p-2 text-[#afb3ac] transition-colors hover:bg-white/5 hover:text-[#f0f9ff]"
            aria-label="뒤로가기"
          >
            <ArrowLeftIcon />
          </Link>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-headline text-lg font-bold tracking-tight text-[#f0f9ff]">
            기억 사용 내역
          </h1>
        </div>
      </nav>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-4xl px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[calc(6rem+env(safe-area-inset-top))] md:px-6 lg:pt-24">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#303733] p-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("charge")}
              className={`rounded-xl px-4 py-3 text-sm font-extrabold transition-colors ${
                activeTab === "charge" ? "bg-[#4a626d] text-white" : "text-[#b9cad1] hover:bg-white/5"
              }`}
            >
              충전 내역
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("usage")}
              className={`rounded-xl px-4 py-3 text-sm font-extrabold transition-colors ${
                activeTab === "usage" ? "bg-[#4a626d] text-white" : "text-[#b9cad1] hover:bg-white/5"
              }`}
            >
              사용 내역
            </button>
          </div>

          {error ? <p className="mb-4 text-sm font-bold text-[#ffd7d3]">{error}</p> : null}

          <div className="space-y-3">
            {visibleItems.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#303733] px-5 py-6 text-sm text-[#b9cad1]">
                아직 기록이 없습니다.
              </div>
            ) : (
              visibleItems.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-[#303733] px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#f0f5f2]">{describeHistoryItem(item, activeTab)}</p>
                      <p className="mt-1 text-xs text-[#b9cad1]">{formatDateTime(item.createdAt)}</p>
                    </div>
                    <AmountBadge amount={item.amount} mode={activeTab} />
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
