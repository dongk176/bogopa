"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navigation from "@/app/_components/Navigation";
import MemoryBalanceBadge from "@/app/_components/MemoryBalanceBadge";
import { DEFAULT_LETTER_SETTINGS, LetterSettings, loadLetterSettings, saveLetterSettings } from "@/lib/letters/config";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";
import { useRouter } from "next/navigation";

type PersonaItem = {
  persona_id: string;
  name: string;
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.6 1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6.8 15.8h10.4l-1.2-1.8V10a4 4 0 1 0-8 0v4l-1.2 1.8Z" />
      <path d="M10 18.4a2 2 0 0 0 4 0" />
    </svg>
  );
}

type NotificationState = "unsupported" | "default" | "granted" | "denied";

function notificationLabel(status: NotificationState) {
  if (status === "unsupported") return "이 기기에서는 알림 설정을 지원하지 않아요.";
  if (status === "granted") return "알림이 허용되어 있어요. 설정한 시간에 편지가 도착합니다.";
  if (status === "denied") return "알림이 꺼져 있어요. 기기 설정에서 다시 켤 수 있어요.";
  return "알림을 허용하면 도착 시간을 놓치지 않고 편지를 받을 수 있어요.";
}

export default function LettersSchedulePage() {
  const router = useRouter();
  const [settings, setSettings] = useState<LetterSettings>(DEFAULT_LETTER_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [personas, setPersonas] = useState<PersonaItem[]>([]);
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);
  const [notificationState, setNotificationState] = useState<NotificationState>("default");

  useNativeSwipeBack(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/letters/persona");
  });

  useEffect(() => {
    setSettings(loadLetterSettings());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    saveLetterSettings(settings);
  }, [isReady, settings]);

  useEffect(() => {
    let cancelled = false;
    const loadPersonas = async () => {
      try {
        const response = await fetch("/api/persona", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { ok?: boolean; personas?: PersonaItem[] };
        if (!cancelled && payload.ok && Array.isArray(payload.personas)) {
          setPersonas(payload.personas);
        }
      } catch {
        if (!cancelled) setPersonas([]);
      }
    };
    void loadPersonas();
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setNotificationState("unsupported");
      return;
    }
    setNotificationState(Notification.permission as NotificationState);
  }, []);

  const selectedPersonaName = useMemo(() => {
    const selected = personas.find((item) => item.persona_id === settings.personaId);
    return selected?.name || "선택된 기억";
  }, [personas, settings.personaId]);

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") {
      setNotificationState("unsupported");
      return;
    }
    const result = await Notification.requestPermission();
    setNotificationState(result as NotificationState);
  };

  const morningEnabled = settings.enabledKinds.includes("morning");
  const eveningEnabled = settings.enabledKinds.includes("evening");

  return (
    <div className="min-h-screen bg-[#f4ecdf] text-[#4f4335]">
      <Navigation hideMobileBottomNav />

      <header className="sticky top-0 z-50 w-full border-b border-[#ddcfba] bg-[#f8f1e6]/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm lg:pl-64">
        <div className="mx-auto flex h-16 w-full items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Link
              href="/letters/persona"
              className="rounded-xl p-2 text-[#7b6551] transition-colors active:bg-[#eadfcd]"
              aria-label="뒤로가기"
            >
              <ArrowLeftIcon />
            </Link>
            <h1 className="font-headline text-[1.08rem] font-extrabold tracking-tight text-[#5b4836]">도착 시간 설정</h1>
          </div>
          <MemoryBalanceBadge memoryBalance={memoryBalance} showBorder={false} />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-[calc(8.8rem+max(env(safe-area-inset-bottom),0.5rem))] pt-5 lg:max-w-2xl lg:pb-24">
        <section className="rounded-3xl border border-[#ddcfba] bg-[#fbf6ed] p-5">
          <p className="text-xs font-semibold tracking-wide text-[#8b775f]">선택된 기억</p>
          <p className="font-headline mt-1 text-lg font-extrabold tracking-tight text-[#5b4836]">{selectedPersonaName}</p>
          <p className="mt-2 text-sm text-[#776553]">이 시간이 되면 조용히 편지가 도착해요.</p>
        </section>

        <section className="mt-4 space-y-3">
          <div className={`rounded-3xl border p-5 ${morningEnabled ? "border-[#ddcfba] bg-[#fbf6ed]" : "border-[#e7dccd] bg-[#f8f2e9] opacity-65"}`}>
            <div className="mb-2 flex items-center gap-2 text-[#7a6651]">
              <ClockIcon />
              <p className="text-sm font-bold">하루 시작 편지</p>
            </div>
            <input
              type="time"
              value={settings.morningTime}
              disabled={!morningEnabled}
              onChange={(event) => setSettings((prev) => ({ ...prev, morningTime: event.target.value }))}
              className="w-full rounded-2xl border border-[#d8c8b3] bg-[#fffaf2] px-4 py-3 text-[15px] font-semibold text-[#5b4836] outline-none disabled:cursor-not-allowed"
            />
          </div>

          <div className={`rounded-3xl border p-5 ${eveningEnabled ? "border-[#ddcfba] bg-[#fbf6ed]" : "border-[#e7dccd] bg-[#f8f2e9] opacity-65"}`}>
            <div className="mb-2 flex items-center gap-2 text-[#7a6651]">
              <ClockIcon />
              <p className="text-sm font-bold">하루 마무리 편지</p>
            </div>
            <input
              type="time"
              value={settings.eveningTime}
              disabled={!eveningEnabled}
              onChange={(event) => setSettings((prev) => ({ ...prev, eveningTime: event.target.value }))}
              className="w-full rounded-2xl border border-[#d8c8b3] bg-[#fffaf2] px-4 py-3 text-[15px] font-semibold text-[#5b4836] outline-none disabled:cursor-not-allowed"
            />
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-[#ddcfba] bg-[#fbf6ed] p-5">
          <div className="mb-2 flex items-center gap-2 text-[#7a6651]">
            <BellIcon />
            <p className="text-sm font-bold">알림 상태</p>
          </div>
          <p className="text-sm leading-relaxed text-[#776553]">{notificationLabel(notificationState)}</p>
          {notificationState === "default" ? (
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="mt-3 rounded-2xl border border-[#ccb89f] bg-[#f3e6d3] px-4 py-2.5 text-sm font-bold text-[#6f5a46]"
            >
              알림 허용하기
            </button>
          ) : null}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-[55] px-4 pb-[calc(1rem+max(env(safe-area-inset-bottom),0.5rem))] lg:left-64 lg:px-8 lg:pb-6">
        <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2 lg:max-w-2xl">
          <Link
            href="/letters/persona"
            className="rounded-2xl border border-[#d6c5ae] bg-[#f7efe2] px-4 py-3.5 text-center text-sm font-bold text-[#6c5744]"
          >
            기억 다시 고르기
          </Link>
          <Link
            href="/letters/inbox"
            className="rounded-2xl bg-[#6d5642] px-4 py-3.5 text-center text-sm font-extrabold text-[#fff8ee] shadow-[0_12px_24px_rgba(74,56,40,0.22)]"
          >
            편지 보관함 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
