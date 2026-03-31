"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/app/_components/Navigation";
import MemoryBalanceBadge from "@/app/_components/MemoryBalanceBadge";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";

type PersonaItem = {
  persona_id: string;
  name: string;
};

type LetterItem = {
  id: string;
  persona_id: string;
  kind: "morning" | "evening";
  purpose: string;
  title: string;
  preview: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="m4.8 7.5 7.2 6 7.2-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function kindLabel(kind: "morning" | "evening") {
  return kind === "morning" ? "아침 편지" : "밤 편지";
}

function formatDateKorean(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export default function LettersInboxPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<PersonaItem[]>([]);
  const [letters, setLetters] = useState<LetterItem[]>([]);
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useNativeSwipeBack(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/persona");
  });

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      try {
        const [personaRes, letterRes, memoryRes] = await Promise.all([
          fetch("/api/persona", { cache: "no-store" }),
          fetch("/api/letters", { cache: "no-store" }),
          fetch("/api/memory-pass", { cache: "no-store" }),
        ]);

        if (!cancelled && personaRes.ok) {
          const payload = (await personaRes.json()) as { ok?: boolean; personas?: PersonaItem[] };
          if (payload.ok && Array.isArray(payload.personas)) {
            setPersonas(payload.personas);
          }
        }

        if (!cancelled && letterRes.ok) {
          const payload = (await letterRes.json()) as { ok?: boolean; letters?: LetterItem[] };
          if (payload.ok && Array.isArray(payload.letters)) {
            setLetters(payload.letters);
          }
        }

        if (!cancelled && memoryRes.ok) {
          const payload = (await memoryRes.json()) as { memoryBalance?: number };
          setMemoryBalance(Number(payload.memoryBalance ?? 0));
        }
      } catch {
        if (!cancelled) {
          setLetters([]);
          setMemoryBalance(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const personaNameMap = useMemo(() => {
    return new Map(personas.map((item) => [item.persona_id, item.name]));
  }, [personas]);

  return (
    <div className="min-h-screen bg-[#ffffff] text-[#2f342e]">
      <Navigation hideMobileBottomNav />

      <header className="sticky top-0 z-50 w-full border-b border-[#d6ddd8] bg-[#ffffff]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:pl-64">
        <div className="mx-auto flex h-16 w-full items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Link
              href="/persona"
              className="rounded-xl p-2 text-[#2f342e] transition-colors active:bg-black/5"
              aria-label="뒤로가기"
            >
              <ArrowLeftIcon />
            </Link>
            <h1 className="font-headline text-[1.08rem] font-extrabold tracking-tight text-[#2f342e]">편지 보관함</h1>
          </div>
          <MemoryBalanceBadge memoryBalance={memoryBalance} showBorder={false} />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-[calc(1.2rem+max(env(safe-area-inset-bottom),0.5rem))] pt-5 lg:max-w-2xl lg:pb-8">
        {isLoading ? (
          <section className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`letter-skeleton-${index}`} className="h-28 animate-pulse rounded-3xl bg-[#e8ece5]" />
            ))}
          </section>
        ) : letters.length > 0 ? (
          <section className="space-y-3">
            {letters.map((item) => (
              <Link
                key={item.id}
                href={`/letters/read?id=${encodeURIComponent(item.id)}`}
                className="relative block rounded-3xl bg-[#38403b] p-4"
                style={{ boxShadow: "0 12px 28px rgba(47,52,46,0.16)" }}
              >
                <div className="absolute right-4 top-4 inline-flex items-center gap-1.5">
                  {!item.is_read ? <span className="h-2 w-2 rounded-full bg-[#4a626d]" /> : null}
                  <span className="rounded-full bg-[#d1e4ef] px-2.5 py-0.5 text-[13px] font-bold text-[#2f4651]">
                    {kindLabel(item.kind)}
                  </span>
                </div>

                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#d1e4ef] text-[#2f4651]">
                  <EnvelopeIcon />
                </div>

                <p className="mt-3 font-headline text-[1.02rem] font-extrabold tracking-tight text-[#f0f5f2]">
                  {item.title || `${formatDateKorean(item.created_at)} ${kindLabel(item.kind)}`}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#3e5560]">{personaNameMap.get(item.persona_id) || "기억"}</p>
              </Link>
            ))}
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-[#38403b] p-6 text-center">
            <p className="text-sm text-[#b9cad1]">아직 도착한 편지가 없어요. 먼저 편지를 만들어주세요.</p>
            <Link
              href="/letters"
              className="mt-4 inline-flex rounded-2xl bg-[#4a626d] px-4 py-2.5 text-sm font-extrabold text-[#f0f9ff] hover:bg-[#3e5661]"
            >
              편지 만들기
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
