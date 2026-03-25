"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadPersonaAnalysis } from "@/lib/persona/storage";
import { PersonaAnalysis } from "@/types/persona";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import HomeConfirmModal from "@/app/_components/HomeConfirmModal";

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.6 19.2a6.4 6.4 0 0 1 12.8 0" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function buildAiDigest(analysis: PersonaAnalysis) {
  const toneSummary = `${analysis.speechStyle.baseTone.join(", ")} / ${analysis.speechStyle.politeness} / ${analysis.speechStyle.sentenceLength}`;
  const behaviorSummary = analysis.conversationBehavior.empathyFirst
    ? `공감 우선 응답을 기본으로 하고, ${analysis.conversationBehavior.feedbackStyle} 흐름으로 대화를 이어갑니다.`
    : `${analysis.conversationBehavior.feedbackStyle} 중심으로, 과한 감정 표현보다 담백하게 반응합니다.`;
  const topicSummary =
    analysis.topics.frequent.length > 0 ? analysis.topics.frequent.slice(0, 3).join(", ") : "일상 안부, 감정 정리";
  const uncertaintySummary =
    analysis.uncertainFields.length > 0
      ? analysis.uncertainFields.map((item) => `${item.field} (${item.reason})`).slice(0, 2).join(" / ")
      : "주요 항목에서 큰 불확실성은 확인되지 않았습니다.";

  return [
    `${analysis.personaInput.relation} ${analysis.personaInput.displayName} 페르소나로 분석되었고, 목표는 "${analysis.conversationIntent.primaryGoal}" 중심입니다.`,
    `말투 핵심은 ${toneSummary} 입니다.`,
    behaviorSummary,
    `주요 대화 주제는 ${topicSummary} 입니다.`,
    `분석 신뢰도는 ${(analysis.analysisSummary.confidence * 100).toFixed(0)}%이며, 불확실성 요약: ${uncertaintySummary}`,
  ];
}

export default function StepFivePage() {
  const [analysis, setAnalysis] = useState<PersonaAnalysis | null>(null);
  const aiDigest = useMemo(() => (analysis ? buildAiDigest(analysis) : []), [analysis]);
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);

  useEffect(() => {
    const loaded = loadPersonaAnalysis() as any;
    if (loaded?.analysisSummary && loaded?.personaInput) {
      setAnalysis(loaded as PersonaAnalysis);
      return;
    }
    setAnalysis(null);
  }, []);

  if (!analysis) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f5] px-6 text-center text-[#2f342e]">
        <div className="max-w-md rounded-3xl border border-[#afb3ac]/20 bg-white p-8 shadow-sm">
          <p className="mb-2 font-headline text-2xl font-bold text-[#4a626d]">분석 결과가 없습니다</p>
          <p className="mb-6 text-sm text-[#5d605a]">1~3단계를 완료한 뒤 다시 진입해주세요.</p>
          <Link
            href="/step-1"
            className="inline-flex items-center justify-center rounded-full bg-[#4a626d] px-5 py-3 text-sm font-semibold text-[#f0f9ff]"
          >
            1단계로 이동
          </Link>
        </div>
      </div>
    );
  }

  const topMemories = analysis.memoryAnchors.slice(0, 3);
  const topReplies = analysis.sampleReplies.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#faf9f5] text-[#2f342e]">
      <header className="fixed top-0 z-50 w-full border-b border-[#afb3ac]/25 bg-[#faf9f5]/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:px-12">
          <button 
            type="button"
            onClick={() => setIsHomeModalOpen(true)}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <img src="/logo/bogopa%20logo.png" alt="보고파" className="h-8 w-auto object-contain" />
            <span className="font-headline text-2xl font-bold tracking-tight text-[#4a626d]">Bogopa</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-28 pt-24 md:pt-28">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.26em] text-[#4a626d]/45">Persona Analysis</p>
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-[#2f342e] md:text-5xl">분석 결과</h1>
        </div>

        <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/70 p-8 shadow-[0_12px_28px_rgba(0,0,0,0.05)] backdrop-blur-sm md:p-10">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-[#e6e9e2] text-[#4a626d]/60 ring-4 ring-white">
              {analysis.personaInput.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={analysis.personaInput.avatarUrl} alt="persona avatar" className="h-full w-full object-cover" />
              ) : (
                <UserIcon />
              )}
            </div>
            <h2 className="font-headline text-3xl font-bold text-[#2f342e]">{analysis.personaInput.displayName}</h2>
            <p className="text-sm font-medium text-[#4a626d]">관계: {analysis.personaInput.relation}</p>
            <p className="max-w-2xl rounded-xl bg-[#f4f4ef] px-4 py-3 text-sm font-semibold text-[#3e5560] md:text-base">
              {analysis.analysisSummary.oneLineSummary}
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm md:col-span-2">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#4a626d]/50">AI 분석 정리</h3>
            <ul className="space-y-2">
              {aiDigest.map((line, idx) => (
                <li key={`${idx}-${line}`} className="rounded-xl bg-[#eef5f8] px-4 py-3 text-sm leading-relaxed text-[#3e5560]">
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#4a626d]/50">자주 쓰는 표현</h3>
            <div className="flex flex-wrap gap-2">
              {analysis.textHabits.frequentPhrases.slice(0, 8).map((item) => (
                <span key={item} className="rounded-full bg-[#f4f4ef] px-3 py-1 text-sm text-[#5d605a]">
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#4a626d]/50">나를 부르는 호칭</h3>
            {analysis.addressing.callsUserAs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {analysis.addressing.callsUserAs.map((item) => (
                  <span key={item} className="rounded-full bg-[#f4f4ef] px-3 py-1 text-sm text-[#5d605a]">
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#787c75]">확인된 호칭이 없어 빈 상태로 저장되었습니다.</p>
            )}
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm md:col-span-2">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#4a626d]/50">말투 요약</h3>
            <p className="mb-3 text-sm leading-relaxed text-[#5d605a]">{analysis.speechStyle.baseTone.join(", ")}</p>
            <p className="text-sm leading-relaxed text-[#5d605a]">{analysis.textHabits.frequentOpeners.join(" · ")} / {analysis.textHabits.frequentClosers.join(" · ")}</p>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#4a626d]/50">대표 기억 3개</h3>
            <div className="space-y-3">
              {topMemories.map((item) => (
                <div key={item.title} className="rounded-xl bg-[#f4f4ef] p-3">
                  <p className="mb-1 text-xs font-semibold text-[#4a626d]">{item.title}</p>
                  <p className="text-sm text-[#5d605a]">{item.summary}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#4a626d]/50">불확실한 항목</h3>
            {analysis.uncertainFields.length > 0 ? (
              <ul className="space-y-2">
                {analysis.uncertainFields.map((item) => (
                  <li key={`${item.field}-${item.reason}`} className="rounded-xl bg-[#fff0ef] p-3 text-sm text-[#8a4b49]">
                    <span className="font-semibold">{item.field}</span> - {item.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#787c75]">현재 불확실 항목이 없습니다.</p>
            )}
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm md:col-span-2">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#4a626d]/50">예시 답장</h3>
            {topReplies.length > 0 ? (
              <div className="space-y-2">
                {topReplies.map((reply, idx) => (
                  <p key={`${idx}-${reply}`} className="rounded-xl bg-[#f4f4ef] p-3 text-sm leading-relaxed text-[#5d605a]">
                    {reply}
                  </p>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-[#f4f4ef] p-3 text-sm leading-relaxed text-[#787c75]">
                고정 예시 문구 없이 톤/관계/안전 규칙 기반으로 응답을 생성합니다.
              </p>
            )}
          </section>
        </div>
      </main>

      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 md:left-1/2 md:right-auto md:w-[420px] md:-translate-x-1/2">
        <Link
          href="/chat"
          className="group flex w-full items-center justify-center gap-2 rounded-full bg-[#4a626d] px-6 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98]"
        >
          바로 채팅 시작
          <span className="transition-transform group-hover:translate-x-1">
            <ArrowRightIcon />
          </span>
        </Link>
      </div>
      <HomeConfirmModal 
        isOpen={isHomeModalOpen} 
        onClose={() => setIsHomeModalOpen(false)} 
      />
    </div>
  );
}
