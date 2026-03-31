"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navigation from "@/app/_components/Navigation";
import MemoryBalanceBadge from "@/app/_components/MemoryBalanceBadge";
import {
  DEFAULT_LETTER_SETTINGS,
  LetterSettings,
  describePersonaMood,
  loadLetterSettings,
  saveLetterSettings,
} from "@/lib/letters/config";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";
import { useRouter } from "next/navigation";

type PersonaItem = {
  persona_id: string;
  name: string;
  avatar_url: string | null;
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.3" />
      <path d="M5.3 19a6.7 6.7 0 0 1 13.4 0" />
    </svg>
  );
}

function relationFromName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("엄마") || normalized.includes("아빠") || normalized.includes("부모")) return "가족";
  if (normalized.includes("연인") || normalized.includes("자기")) return "연인";
  if (normalized.includes("친구")) return "친구";
  return "소중한 기억";
}

export default function LettersPersonaPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<LetterSettings>(DEFAULT_LETTER_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [items, setItems] = useState<PersonaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);

  useNativeSwipeBack(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/letters");
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
          setItems(payload.personas);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
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

  const selectedPersona = useMemo(
    () => items.find((item) => item.persona_id === settings.personaId) || null,
    [items, settings.personaId],
  );

  return (
    <div className="min-h-screen bg-[#f4ecdf] text-[#4f4335]">
      <Navigation hideMobileBottomNav />

      <header className="sticky top-0 z-50 w-full border-b border-[#ddcfba] bg-[#f8f1e6]/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm lg:pl-64">
        <div className="mx-auto flex h-16 w-full items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Link
              href="/letters"
              className="rounded-xl p-2 text-[#7b6551] transition-colors active:bg-[#eadfcd]"
              aria-label="뒤로가기"
            >
              <ArrowLeftIcon />
            </Link>
            <h1 className="font-headline text-[1.08rem] font-extrabold tracking-tight text-[#5b4836]">기억 선택</h1>
          </div>
          <MemoryBalanceBadge memoryBalance={memoryBalance} showBorder={false} />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-[calc(8.8rem+max(env(safe-area-inset-bottom),0.5rem))] pt-5 lg:max-w-2xl lg:pb-24">
        <section className="rounded-3xl border border-[#ddcfba] bg-[#fbf6ed] p-5">
          <p className="font-headline text-lg font-extrabold tracking-tight text-[#5b4836]">누구에게서 편지를 받을까요?</p>
          <p className="mt-2 text-sm leading-relaxed text-[#776553]">
            편지를 보내줄 기억을 하나 고르면, 그 기억의 말투와 결로 아침과 밤의 편지가 도착해요.
          </p>
        </section>

        {isLoading ? (
          <section className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`persona-skeleton-${index}`} className="h-24 animate-pulse rounded-3xl bg-[#eadfcd]" />
            ))}
          </section>
        ) : items.length === 0 ? (
          <section className="mt-4 rounded-3xl border border-[#ddcfba] bg-[#fbf6ed] p-5 text-center">
            <p className="text-sm text-[#776553]">아직 만든 기억이 없어요. 먼저 내 기억을 만들어주세요.</p>
            <Link
              href="/step-1/start"
              className="mt-4 inline-flex rounded-2xl bg-[#6d5642] px-4 py-2.5 text-sm font-extrabold text-[#fff8ee]"
            >
              내 기억 만들기
            </Link>
          </section>
        ) : (
          <section className="mt-4 space-y-3">
            {items.map((item, index) => {
              const isSelected = item.persona_id === settings.personaId;
              const avatarUrl =
                item.avatar_url && item.avatar_url.includes("amazonaws.com")
                  ? `/api/image-proxy?url=${encodeURIComponent(item.avatar_url)}`
                  : item.avatar_url;

              return (
                <button
                  key={item.persona_id}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, personaId: item.persona_id }))}
                  className={`w-full rounded-3xl border p-4 text-left ${
                    isSelected
                      ? "border-[#90765c] bg-[#f6ecde] shadow-[0_12px_24px_rgba(93,74,56,0.12)]"
                      : "border-[#ddcfba] bg-[#fbf6ed]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-2xl border border-[#e2d4c0] bg-[#efe4d3]">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[#8a745e]">
                          <UserIcon />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-headline truncate text-lg font-extrabold tracking-tight text-[#5b4836]">{item.name}</p>
                      <p className="text-xs font-semibold text-[#8a765f]">{relationFromName(item.name)}</p>
                      <p className="mt-1 truncate text-xs text-[#7c6a58]">{describePersonaMood(item.name, index)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-[55] px-4 pb-[calc(1rem+max(env(safe-area-inset-bottom),0.5rem))] lg:left-64 lg:px-8 lg:pb-6">
        <div className="mx-auto w-full max-w-md lg:max-w-2xl">
          <Link
            href={selectedPersona ? "/letters/schedule" : "#"}
            aria-disabled={!selectedPersona}
            className={`block w-full rounded-2xl px-4 py-3.5 text-center text-sm font-extrabold ${
              selectedPersona
                ? "bg-[#6d5642] text-[#fff8ee] shadow-[0_12px_24px_rgba(74,56,40,0.22)]"
                : "cursor-not-allowed bg-[#d8cbb8] text-[#9a8876]"
            }`}
          >
            {selectedPersona ? `${selectedPersona.name}에게 편지 받기` : "기억을 먼저 선택해주세요"}
          </Link>
        </div>
      </div>
    </div>
  );
}
