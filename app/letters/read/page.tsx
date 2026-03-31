"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Navigation from "@/app/_components/Navigation";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";

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

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="12" r="1.1" />
      <circle cx="12" cy="12" r="1.1" />
      <circle cx="18" cy="12" r="1.1" />
    </svg>
  );
}

function formatLetterDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long", timeZone: "Asia/Seoul" }).format(date);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일 ${weekday}`;
}

function kindLabel(kind: "morning" | "evening") {
  return kind === "morning" ? "아침 편지" : "밤 편지";
}

function LetterReadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const letterId = searchParams.get("id")?.trim() || "";
  const [letter, setLetter] = useState<LetterItem | null>(null);
  const [personaName, setPersonaName] = useState("기억");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useNativeSwipeBack(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/letters/inbox");
  });

  useEffect(() => {
    if (!letterId) {
      setIsLoading(false);
      setError("편지 정보를 찾을 수 없습니다.");
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/letters?id=${encodeURIComponent(letterId)}&markRead=1`, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; letter?: LetterItem; error?: string };
        if (!response.ok || !payload.ok || !payload.letter) {
          throw new Error(payload.error || "편지를 불러오지 못했습니다.");
        }
        if (cancelled) return;
        setLetter(payload.letter);

        const personaRes = await fetch("/api/persona", { cache: "no-store" });
        if (personaRes.ok) {
          const personaPayload = (await personaRes.json()) as { ok?: boolean; personas?: PersonaItem[] };
          const selected = personaPayload.personas?.find((item) => item.persona_id === payload.letter!.persona_id);
          if (!cancelled && selected?.name) {
            setPersonaName(selected.name);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "편지를 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [letterId]);

  const dateLabel = useMemo(() => (letter ? formatLetterDate(letter.created_at) : ""), [letter]);
  const kindText = letter ? kindLabel(letter.kind) : "편지";

  return (
    <div className="letter-page-bg min-h-screen text-[#2f342e]">
      <Navigation hideMobileBottomNav />

      <header className="fixed top-0 z-50 w-full border-b border-[#d6ddd8] bg-[#ffffff]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:pl-64">
        <div className="mx-auto flex h-16 w-full items-center justify-between px-4">
          <Link href="/letters/inbox" className="rounded-xl p-2 text-[#2f342e] transition-colors hover:bg-black/5" aria-label="뒤로가기">
            <ArrowLeftIcon />
          </Link>
          <span className="font-headline text-lg font-bold tracking-tight text-[#2f342e]">기억에서 온 편지</span>
          <button type="button" className="rounded-xl p-2 text-[#2f342e] transition-colors hover:bg-black/5" aria-label="더보기">
            <DotsIcon />
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center px-6 pb-32 pt-[calc(5.8rem+env(safe-area-inset-top))]">
        {isLoading ? (
          <div className="mt-20 h-10 w-10 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
        ) : error ? (
          <article className="mt-12 w-full rounded-3xl border border-[#d6ddd8] bg-[#ffffff] p-6 text-center">
            <p className="text-sm text-[#ffb4ab]">{error}</p>
            <Link
              href="/letters/inbox"
              className="mt-4 inline-flex rounded-2xl bg-[#4a626d] px-4 py-2.5 text-sm font-bold text-[#f0f9ff]"
            >
              보관함으로 돌아가기
            </Link>
          </article>
        ) : letter ? (
          <article className="w-full">
            <div className="mb-10 -rotate-1">
              <p className="font-headline text-sm font-semibold tracking-widest text-[#4a626d]">{dateLabel} · {kindText}</p>
              <h1 className="font-headline mt-1 text-2xl font-bold text-[#2f342e]">{personaName}에게</h1>
            </div>

            <section className="px-1 py-1 md:px-0 md:py-0">
              <div className="letter-writing serif-kr whitespace-pre-wrap tracking-[0.01em] text-[#2f342e]">
                {letter.content}
              </div>
              <p className="serif-kr mt-10 text-right text-[0.98rem] text-[#4a626d]">진심을 담아, {personaName}</p>
            </section>

            <div className="mt-12 flex justify-center opacity-80">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#4a626d]/55">
                <span className="font-headline text-[10px] font-bold uppercase leading-tight tracking-tight text-[#4a626d]">
                  Bogopa
                  <br />
                  Letter
                </span>
              </div>
            </div>
          </article>
        ) : null}
      </main>

      <style jsx>{`
        .serif-kr {
          font-family: "Noto Serif KR", serif;
        }
        .letter-page-bg {
          background-color: #ffffff;
          background-image:
            radial-gradient(rgba(74, 98, 109, 0.055) 0.65px, transparent 0.65px),
            radial-gradient(rgba(47, 52, 46, 0.04) 0.8px, transparent 0.8px);
          background-size: 3px 3px, 5px 5px;
          background-position: 0 0, 1px 2px;
        }
        .letter-writing {
          --font-size: 17px;
          --line-step: 34px;
          font-size: var(--font-size);
          line-height: var(--line-step);
        }
        @media (min-width: 768px) {
          .letter-writing {
            --font-size: 18px;
            --line-step: 36px;
          }
        }
      `}</style>
    </div>
  );
}

export default function LettersReadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#ffffff]" />}>
      <LetterReadContent />
    </Suspense>
  );
}
