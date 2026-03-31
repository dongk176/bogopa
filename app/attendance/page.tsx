"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/app/_components/Navigation";
import MemoryBalanceBadge from "@/app/_components/MemoryBalanceBadge";
import { ATTENDANCE_REWARDS } from "@/lib/attendance/config";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";

type AttendanceReward = {
  day: number;
  reward: number;
};

type AttendancePayload = {
  ok: boolean;
  streakDay: number;
  checkedToday: boolean;
  nextReward: number;
  nextDay: number;
  rewards: AttendanceReward[];
  memoryBalance?: number;
  rewardGranted?: number;
  alreadyCheckedToday?: boolean;
  error?: string;
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function MemoryMarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.4v4.2l2.7 1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function AttendancePage() {
  const router = useRouter();
  const [streak, setStreak] = useState(0);
  const [checkedToday, setCheckedToday] = useState(false);
  const [nextReward, setNextReward] = useState(50);
  const [nextDay, setNextDay] = useState(1);
  const [rewards, setRewards] = useState<AttendanceReward[]>([...ATTENDANCE_REWARDS]);
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  useNativeSwipeBack(() => {
    router.push("/");
  });

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/attendance", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as AttendancePayload;
        if (!payload.ok || cancelled) return;

        setStreak(Number(payload.streakDay || 0));
        setCheckedToday(Boolean(payload.checkedToday));
        setNextReward(Number(payload.nextReward || 0));
        setNextDay(Number(payload.nextDay || 1));
        setRewards(Array.isArray(payload.rewards) ? payload.rewards : []);
      } catch (error) {
        console.error("[attendance] failed to load status", error);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => {
      setNotice("");
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;

    const loadMemoryBalance = async () => {
      try {
        const response = await fetch("/api/memory-pass", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setMemoryBalance(Number(data?.memoryBalance ?? 0));
      } catch {
        if (!cancelled) setMemoryBalance(null);
      }
    };

    void loadMemoryBalance();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCheckAttendance() {
    if (checkedToday || !isReady || isSubmitting) return;

    setIsSubmitting(true);
    setNotice("");

    try {
      const response = await fetch("/api/attendance", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as AttendancePayload;
      if (!response.ok || !payload.ok) {
        setNotice(payload.error || "출석 처리에 실패했습니다.");
        return;
      }

      setStreak(Number(payload.streakDay || 0));
      setCheckedToday(Boolean(payload.checkedToday));
      setNextReward(Number(payload.nextReward || 0));
      setNextDay(Number(payload.nextDay || 1));
      setRewards(Array.isArray(payload.rewards) ? payload.rewards : []);
      if (typeof payload.memoryBalance === "number") {
        setMemoryBalance(payload.memoryBalance);
      }

      if (payload.alreadyCheckedToday) {
        setNotice("오늘은 이미 출석 완료했어요.");
      } else {
        setNotice(`출석 완료! ${Number(payload.rewardGranted || 0)}기억 지급`);
      }
    } catch (error) {
      console.error("[attendance] failed to check in", error);
      setNotice("출석 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#faf9f5] text-[#2f342e]">
      <Navigation hideMobileBottomNav />

      <header className="sticky top-0 z-50 w-full bg-[#242926] pt-[env(safe-area-inset-top)] lg:pl-64">
        <div className="mx-auto flex h-16 w-full items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-xl p-2 text-[#afb3ac] transition-colors hover:bg-white/5 hover:text-[#f0f5f2]"
              aria-label="홈으로가기"
            >
              <ArrowLeftIcon />
            </Link>
            <h1 className="font-headline text-xl font-bold tracking-tight text-[#f0f5f2]">출석체크</h1>
          </div>
          <MemoryBalanceBadge memoryBalance={memoryBalance} showBorder={false} />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6 pb-[calc(9.5rem+max(env(safe-area-inset-bottom),0.5rem))] lg:max-w-2xl lg:pl-64 lg:pb-28">
        <section className="rounded-3xl border border-white/10 bg-[#303733] p-6 shadow-[0_14px_32px_rgba(0,0,0,0.25)]">
          <p className="text-xs font-semibold tracking-wide text-[#b9cad1]">연속 출석</p>
          <p className="mt-1 font-headline text-3xl font-extrabold tracking-tight text-[#f0f5f2]">
            {streak}일째
          </p>
          <p className="mt-2 text-sm text-[#b9cad1]">지금 출첵하면 {nextReward}기억 보상</p>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-[#303733] p-5 shadow-[0_14px_32px_rgba(0,0,0,0.25)]">
          <div className="grid grid-cols-5 gap-2">
            {rewards.map((item) => {
              const isClaimed = streak >= item.day;
              const isUpcoming = !isClaimed && nextDay === item.day;
              return (
                <div key={item.day} className="flex flex-col items-center gap-1.5 py-1">
                  <button
                    type="button"
                    disabled
                    className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl text-sm font-extrabold ${
                      isClaimed
                        ? "bg-[#4a626d] text-[#f0f9ff]"
                        : isUpcoming
                          ? "bg-[#42544d] text-[#e6f5ff]"
                          : "bg-[#cfd6cd] text-[#111111]"
                    }`}
                  >
                    <span className={isClaimed || isUpcoming ? "text-[#bfe4f5]" : "text-[#4a626d]"}>
                      <MemoryMarkIcon className="h-5 w-5" />
                    </span>
                    <span className={isClaimed ? "text-[#ffffff]" : isUpcoming ? "text-[#ffffff]" : "text-[#111111]"}>{item.reward}</span>
                  </button>
                  <p
                    className="text-xs font-bold text-[#111111]"
                  >
                    {item.day}일
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {notice ? (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="rounded-2xl border border-white/10 bg-[#303733]/95 px-4 py-2.5 text-center text-sm font-semibold text-[#f0f5f2] shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            {notice}
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-[calc(1rem+max(env(safe-area-inset-bottom),0.5rem))] lg:left-64 lg:px-8 lg:pb-6">
        <div className="mx-auto w-full max-w-md lg:max-w-2xl">
          <button
            type="button"
            onClick={handleCheckAttendance}
            disabled={!isReady || checkedToday || isSubmitting}
            className="w-full rounded-2xl bg-[#4a626d] px-5 py-4 text-base font-extrabold text-[#f0f9ff] shadow-[0_12px_30px_rgba(74,98,109,0.35)] transition-all disabled:opacity-45"
          >
            {checkedToday ? "오늘 출석 완료!" : isSubmitting ? "출석 처리 중..." : "출첵하기!"}
          </button>
        </div>
      </div>
    </div>
  );
}
