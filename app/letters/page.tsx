"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Navigation from "@/app/_components/Navigation";
import {
  DEFAULT_LETTER_SETTINGS,
  LetterKind,
  LetterSettings,
  loadLetterSettings,
  saveLetterSettings,
} from "@/lib/letters/config";
import { useRouter } from "next/navigation";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";

type PersonaItem = {
  persona_id: string;
  name: string;
  avatar_url: string | null;
  runtime?: {
    relation?: string | null;
  } | null;
};

function SunriseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 17h16M7 17a5 5 0 0 1 10 0" />
      <path d="M12 5v3M6.4 7.3l2.1 2.1M17.6 7.3l-2.1 2.1" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M15.2 3.7a7.8 7.8 0 1 0 5.1 13.6 7 7 0 1 1-5.1-13.6Z" />
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

function kindMeta(kind: LetterKind): { title: string; body: string; icon: ReactNode } {
  if (kind === "morning") {
    return {
      title: "하루 시작 편지",
      body: "하루를 시작할 용기와 다정함을 담은 편지를 받아요.",
      icon: <SunriseIcon />,
    };
  }
  return {
    title: "하루 마무리 편지",
    body: "오늘을 정리하고 마음을 다독이는 편지를 받아요.",
    icon: <MoonIcon />,
  };
}

export default function LettersMainPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<LetterSettings>(DEFAULT_LETTER_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [selectedKind, setSelectedKind] = useState<LetterKind | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaItem[]>([]);
  const [isPersonaLoading, setIsPersonaLoading] = useState(true);
  const [kindError, setKindError] = useState("");
  const [personaError, setPersonaError] = useState("");
  const [isFinishing, setIsFinishing] = useState(false);
  const [isCompletedOverlayOpen, setIsCompletedOverlayOpen] = useState(false);
  const [completeError, setCompleteError] = useState("");

  useNativeSwipeBack(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  });

  useEffect(() => {
    const loaded = loadLetterSettings();
    setSettings(loaded);
    if (loaded.enabledKinds[0]) {
      setSelectedKind(loaded.enabledKinds[0]);
    }
    if (loaded.personaId) {
      setSelectedPersonaId(loaded.personaId);
    }
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
      } finally {
        if (!cancelled) setIsPersonaLoading(false);
      }
    };
    void loadPersonas();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPersona = useMemo(
    () => personas.find((item) => item.persona_id === selectedPersonaId) || null,
    [personas, selectedPersonaId],
  );

  const selectedKindMeta = selectedKind ? kindMeta(selectedKind) : null;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const handleNext = () => {
    if (!selectedKind) {
      setKindError("편지 종류를 선택해주세요.");
      return;
    }
    setKindError("");
    setCurrentStep(2);
  };

  const handleComplete = async () => {
    if (!selectedKind) {
      setCurrentStep(1);
      setKindError("편지 종류를 선택해주세요.");
      return;
    }
    if (!selectedPersonaId) {
      setPersonaError("편지를 받을 기억을 선택해주세요.");
      return;
    }

    setPersonaError("");
    setCompleteError("");
    setIsFinishing(true);
    const startedAt = Date.now();

    const nextSettings: LetterSettings = {
      ...settings,
      enabledKinds: [selectedKind],
      personaId: selectedPersonaId,
      morningTime: selectedKind === "morning" ? "08:00" : settings.morningTime || "08:00",
      eveningTime: selectedKind === "evening" ? "22:00" : settings.eveningTime || "22:00",
    };
    setSettings(nextSettings);
    saveLetterSettings(nextSettings);

    setIsCompletedOverlayOpen(true);
    try {
      const response = await fetch("/api/letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: selectedPersonaId,
          kind: selectedKind,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { letter?: { id?: string }; error?: string };
      if (!response.ok || !payload.letter?.id) {
        throw new Error(payload.error || "편지를 생성하지 못했습니다.");
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < 2200) {
        await sleep(2200 - elapsed);
      }
      router.push(`/letters/read?id=${encodeURIComponent(payload.letter.id)}`);
    } catch (error) {
      setIsCompletedOverlayOpen(false);
      setCompleteError(error instanceof Error ? error.message : "편지 생성 중 오류가 발생했습니다.");
      setIsFinishing(false);
    }
  };

  const stepProgressWidth = currentStep === 1 ? "w-1/2" : "w-full";

  return (
    <div className="min-h-screen bg-[#faf9f5] text-[#2f342e]">
      <Navigation hideMobileBottomNav />

      <header className="fixed top-0 z-50 w-full bg-[#faf9f5]/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:pl-64">
        <div className="mx-auto flex h-16 w-full items-center justify-center px-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[#6b7f89]">Step {currentStep}/2</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#edeee8]">
              <div className={`h-full bg-[#4a626d] transition-all duration-300 ${stepProgressWidth}`} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-[calc(8.8rem+max(env(safe-area-inset-bottom),0.5rem))] pt-[calc(5.2rem+env(safe-area-inset-top))] lg:max-w-2xl lg:pb-24">
        <div className="p-0 md:p-0">
          {currentStep === 1 ? (
            <>
              <section className="mb-5">
                <h2 className="font-headline text-2xl font-extrabold tracking-tight text-[#2f342e]">어떤 편지를 받을까요?</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#6b7f89]">
                  원하는 편지 한 가지를 먼저 선택해주세요.
                </p>
              </section>

              <section className="space-y-3">
                {(["morning", "evening"] as LetterKind[]).map((kind) => {
                  const active = selectedKind === kind;
                  const meta = kindMeta(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        setSelectedKind(kind);
                        setKindError("");
                      }}
                      className={`relative w-full min-h-[118px] rounded-3xl border p-5 text-left transition-all ${
                        active
                          ? "border-[#7fa4b6] bg-[#4a626d] shadow-[0_14px_28px_rgba(0,0,0,0.24)]"
                          : "border-[#d6ddd8] bg-[#ffffff] hover:border-[#8ba2ae]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className={`font-headline text-lg font-extrabold tracking-tight ${active ? "text-[#f0f9ff]" : "text-[#2f342e]"}`}>
                            {meta.title}
                          </p>
                          <p className={`mt-1 text-sm ${active ? "text-[#dce9f0]" : "text-[#6b7f89]"}`}>{meta.body}</p>
                        </div>
                        <div
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${
                            active ? "bg-[#d1e4ef] text-[#2f4651]" : "bg-[#e8eded] text-[#4a626d]"
                          }`}
                        >
                          {meta.icon}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </section>
              {kindError ? <p className="mt-3 text-sm text-[#9f403d]">{kindError}</p> : null}
            </>
          ) : (
            <>
              <section className="mb-5">
                <h2 className="font-headline text-2xl font-extrabold tracking-tight text-[#2f342e]">
                  어떤 기억에게 편지를 받을까요?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#6b7f89]">
                  선택한 기억의 분위기로 편지가 도착해요.
                </p>
                {selectedKindMeta ? <p className="mt-2 text-xs font-semibold text-[#4a626d]">{selectedKindMeta.title}</p> : null}
              </section>

              {isPersonaLoading ? (
                <section className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={`persona-skeleton-${index}`} className="h-20 animate-pulse rounded-3xl bg-[#e9eeea]" />
                  ))}
                </section>
              ) : personas.length === 0 ? (
                <section className="rounded-3xl border border-[#d6ddd8] bg-[#ffffff] p-5 text-center">
                  <p className="text-sm text-[#4a626d]">
                    아직 만든 기억이 없어요.
                    <br />
                    먼저 내 기억을 만들어주세요.
                  </p>
                  <Link
                    href="/step-1/start"
                    className="mt-3 inline-flex rounded-2xl bg-[#4a626d] px-4 py-2.5 text-sm font-extrabold text-[#f0f9ff] hover:bg-[#3e5661]"
                  >
                    내 기억 만들기
                  </Link>
                </section>
              ) : (
                <section className="space-y-3">
                  {personas.map((item) => {
                    const active = selectedPersonaId === item.persona_id;
                    const relationText =
                      typeof item.runtime?.relation === "string" && item.runtime.relation.trim().length > 0
                        ? item.runtime.relation.trim()
                        : "관계 미설정";
                    const avatarUrl =
                      item.avatar_url && item.avatar_url.includes("amazonaws.com")
                        ? `/api/image-proxy?url=${encodeURIComponent(item.avatar_url)}`
                        : item.avatar_url;

                    return (
                      <button
                        key={item.persona_id}
                        type="button"
                        onClick={() => {
                          setSelectedPersonaId(item.persona_id);
                          setPersonaError("");
                        }}
                        className={`relative w-full min-h-[86px] rounded-3xl border p-4 text-left transition-all ${
                          active
                            ? "border-[#7fa4b6] bg-[#4a626d] shadow-[0_14px_28px_rgba(0,0,0,0.24)]"
                            : "border-[#d6ddd8] bg-[#ffffff] hover:border-[#8ba2ae]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-24 w-24 overflow-hidden rounded-2xl ${
                                active ? "bg-[#d1e4ef]" : "bg-[#eef2ee]"
                              }`}
                            >
                              {avatarUrl ? (
                                <img src={avatarUrl} alt={item.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className={`grid h-full w-full place-items-center ${active ? "text-[#2f4651]" : "text-[#6b7f89]"}`}>
                                  <UserIcon />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className={`truncate font-headline text-lg font-extrabold tracking-tight ${active ? "text-[#f0f9ff]" : "text-[#2f342e]"}`}>
                                {item.name}
                              </p>
                              <p className={`mt-0.5 truncate text-xs font-semibold ${active ? "text-[#cddde6]" : "text-[#6b7f89]"}`}>
                                {relationText}
                              </p>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </section>
              )}
              {personaError ? <p className="mt-3 text-sm text-[#9f403d]">{personaError}</p> : null}
              {completeError ? <p className="mt-3 text-sm text-[#9f403d]">{completeError}</p> : null}
            </>
          )}

        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-[55] border-t border-[#dfe4df] bg-white px-4 pb-[calc(1rem+max(env(safe-area-inset-bottom),0.5rem))] pt-2 lg:left-64 lg:px-8 lg:pb-6">
        <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2 lg:max-w-2xl">
          {currentStep === 1 ? (
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full bg-[#f4f4ef] px-4 py-3.5 text-center text-sm font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98] md:rounded-2xl md:font-bold"
            >
              취소
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center justify-center rounded-full bg-[#f4f4ef] px-4 py-3.5 text-center text-sm font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98] md:rounded-2xl md:font-bold"
            >
              이전
            </button>
          )}

          {currentStep === 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="group flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-3.5 text-center text-sm font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] md:rounded-2xl md:font-bold"
            >
              다음으로
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isFinishing || personas.length === 0}
              className="group flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-3.5 text-center text-sm font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:opacity-55 md:rounded-2xl md:font-bold"
            >
              {isFinishing ? "완료 중..." : "완료"}
            </button>
          )}
        </div>
      </div>

      {isCompletedOverlayOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-6 backdrop-blur-[2px]">
          <div className="letter-overlay-card w-full max-w-sm rounded-[2rem] border border-[#d8e0dc] bg-white p-6 shadow-[0_24px_48px_rgba(47,52,46,0.18)]">
            <p className="text-center text-sm font-semibold text-[#4a626d]">설정 완료</p>
            <h3 className="mt-2 text-center font-headline text-xl font-extrabold tracking-tight text-[#2f342e]">
              지금 편지를 전달하고 있어요.
            </h3>

            <div className="mt-6">
              <div className="writing-loader relative overflow-hidden rounded-2xl bg-[#f2f6f4] p-4">
                <div className="writing-paper rounded-xl border border-[#d6ddd8] bg-white p-4">
                  <p className="text-[11px] font-semibold text-[#4a626d]">기억에서 온 편지</p>
                  <p className="mt-1 text-sm font-bold text-[#2f342e]">To. {selectedPersona?.name || "선택된 기억"}</p>
                  <div className="mt-3 space-y-2">
                    <div className="writing-line writing-line-1" />
                    <div className="writing-line writing-line-2" />
                    <div className="writing-line writing-line-3" />
                  </div>
                </div>
                <div className="writing-pen" aria-hidden="true" />
                <p className="mt-3 text-center text-xs font-semibold text-[#5f737c]">
                  {selectedKindMeta ? `${selectedKindMeta.title}을 담아` : "마음을 담아"} 한 줄씩 적고 있어요…
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .letter-overlay-card {
          animation: letterOverlayFadeIn 0.28s ease-out both;
        }
        .writing-loader {
          animation: writingLoaderEnter 0.32s ease-out both;
        }
        .writing-paper {
          animation: writingPaperFloat 1.8s ease-in-out infinite alternate;
        }
        .writing-line {
          height: 7px;
          border-radius: 999px;
          background: linear-gradient(90deg, #8ea6b3 0%, #6f8d9b 68%, #8ea6b3 100%);
          transform-origin: left center;
          animation: writingLineGrow 1.55s ease-in-out infinite;
        }
        .writing-line-1 {
          width: 86%;
          animation-delay: 0s;
        }
        .writing-line-2 {
          width: 78%;
          animation-delay: 0.22s;
        }
        .writing-line-3 {
          width: 68%;
          animation-delay: 0.44s;
        }
        .writing-pen {
          position: absolute;
          right: 22px;
          top: 58px;
          width: 62px;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(90deg, #4a626d 0%, #6c8793 100%);
          transform-origin: 8px 50%;
          animation: writingPenMove 1.55s ease-in-out infinite;
          box-shadow: 0 4px 10px rgba(47, 52, 46, 0.2);
        }
        @keyframes letterOverlayFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes writingLoaderEnter {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.99);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes writingPaperFloat {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-2px);
          }
        }
        @keyframes writingLineGrow {
          0% {
            opacity: 0.45;
            transform: scaleX(0.38);
          }
          45% {
            opacity: 1;
            transform: scaleX(1);
          }
          100% {
            opacity: 0.55;
            transform: scaleX(0.55);
          }
        }
        @keyframes writingPenMove {
          0% {
            transform: translate(0, 0) rotate(-11deg);
          }
          50% {
            transform: translate(-16px, 6px) rotate(-7deg);
          }
          100% {
            transform: translate(2px, -2px) rotate(-11deg);
          }
        }
      `}</style>
    </div>
  );
}
