"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { persistOnboardingStep } from "@/lib/onboarding-client";
import { analyzePersonaMock } from "@/lib/persona/analyzePersonaMock";
import { buildPersonaRuntime } from "@/lib/persona/buildPersonaRuntime";
import {
  loadStepInputsFromLocalStorage,
  savePersonaAnalysis,
  savePersonaRuntime,
} from "@/lib/persona/storage";

type ToneStyle = "다정다감" | "차분하고 논리적" | "발랄하고 유머러스" | "짧고 간결하게";

type ConsentChecklist = {
  counterpartyConsent: boolean;
  rawDeletionAndVirtualModel: boolean;
  noMisuseAndResponsibility: boolean;
};

type StepFourConsent = {
  version: string;
  checklist: ConsentChecklist;
  consent_timestamp: string;
};

type StepFourData = {
  pastedConversation: string;
  uploadedFileName?: string;
  useManualSettings: boolean;
  frequentPhrases: string;
  nickname?: string;
  toneStyle: ToneStyle | null;
  emotionDepth: string;
  emojiStyle: string;
  consent?: StepFourConsent;
  consent_timestamp?: string;
  consent_ip?: string | null;
  is_raw_data_deleted?: boolean;
  sensitiveDataClearedAt?: string;
  step: number;
  updatedAt: string;
};

const STORAGE_KEY = "bogopa_profile_step4";
const MAX_TXT_FILE_SIZE = 500 * 1024;

const TONE_STYLES: ToneStyle[] = ["다정다감", "차분하고 논리적", "발랄하고 유머러스", "짧고 간결하게"];
const EMOTION_OPTIONS = ["풍부한 감정 표현", "적절한 공감 위주", "감정보다는 팩트 위주"];
const EMOJI_OPTIONS = ["이모지 많이 사용 ✨❤️", "가끔 포인트로만 사용 👍", "전혀 사용하지 않음"];
const CONVERSATION_BASED_HINTS = [
  "그때의 말투와 온도를 천천히 되살리고 있어요.",
  "소중한 대화의 결을 조심스럽게 읽는 중이에요.",
  "익숙한 표현과 리듬을 하나씩 모으고 있어요.",
  "기억 속 자주 쓰던 말들을 다시 엮고 있어요.",
  "당신이 남긴 대화의 숨결을 차분히 따라가고 있어요.",
  "오래 남은 문장들의 분위기를 정리하고 있어요.",
  "그날의 대화에서 따뜻한 말투의 단서를 찾고 있어요.",
  "기억에 닿아 있던 호칭과 어투를 살펴보고 있어요.",
  "대화 속 감정의 결을 해치지 않게 다듬고 있어요.",
  "다시 말을 건넬 수 있도록 대화의 온도를 맞추고 있어요.",
];
const MEMORY_EMOTIONAL_HINTS = [
  "기억 한 조각을 천천히 꺼내고 있어요.",
  "조용한 회상의 시간을 준비하고 있어요.",
  "마음속에 남아 있던 장면을 다정하게 정리하고 있어요.",
  "그리운 순간의 결을 따라가고 있어요.",
  "잊고 있던 온기를 다시 떠올리는 중이에요.",
  "못다 한 마음을 꺼낼 준비를 하고 있어요.",
  "당신의 추억이 편히 머물 자리를 만들고 있어요.",
  "기억의 문장을 천천히 이어 붙이고 있어요.",
  "담담한 회상으로 이어질 대화를 준비하고 있어요.",
  "마음이 덜 아프게, 기억을 조심히 다루고 있어요.",
];
const MIN_ANALYZING_MS = 5000;
type DropupMenu = "emotion" | "emoji" | null;

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4.6 13.8 9l4.6 1.8-4.6 1.8L12 17l-1.8-4.4-4.6-1.8L10.2 9 12 4.6Z" />
      <path d="M18.4 3.4 19 5l1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" />
    </svg>
  );
}

function PasteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 4.8h8a1.6 1.6 0 0 1 1.6 1.6V20H6.4V6.4A1.6 1.6 0 0 1 8 4.8Z" />
      <path d="M9 2.8h6v3H9z" />
      <path d="M8.8 10h6.4M8.8 13h6.4M8.8 16h4" />
    </svg>
  );
}

function UploadFileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4.8h6.8L19.2 10v9.2H7V4.8Z" />
      <path d="M13.8 4.8V10h5.4" />
      <path d="M12 16.5v-5" />
      <path d="m9.8 13.7 2.2-2.2 2.2 2.2" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export default function StepFourPage() {
  const router = useRouter();
  const [pastedConversation, setPastedConversation] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [useManualSettings, setUseManualSettings] = useState(false);
  const [frequentPhrases, setFrequentPhrases] = useState("");
  const [toneStyle, setToneStyle] = useState<ToneStyle | null>(null);
  const [emotionDepth, setEmotionDepth] = useState("풍부한 감정 표현");
  const [emojiStyle, setEmojiStyle] = useState("이모지 많이 사용 ✨❤️");
  const [manualError, setManualError] = useState("");
  const [fileError, setFileError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [showExportGuide, setShowExportGuide] = useState(false);
  const [showPrivacyGuide, setShowPrivacyGuide] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [isRequiredConsentOpen, setIsRequiredConsentOpen] = useState(true);
  const [isConversationBasedAnalysis, setIsConversationBasedAnalysis] = useState(false);
  const [consentChecklist, setConsentChecklist] = useState<ConsentChecklist>({
    counterpartyConsent: false,
    rawDeletionAndVirtualModel: false,
    noMisuseAndResponsibility: false,
  });
  const [consentError, setConsentError] = useState("");
  const [openMenu, setOpenMenu] = useState<DropupMenu>(null);
  const [analysisHint, setAnalysisHint] = useState(CONVERSATION_BASED_HINTS[0]);
  const emotionMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiMenuRef = useRef<HTMLDivElement | null>(null);
  const requiredConsentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as Partial<StepFourData>;

      if (typeof saved.pastedConversation === "string") setPastedConversation(saved.pastedConversation);
      if (typeof saved.uploadedFileName === "string") setUploadedFileName(saved.uploadedFileName);
      if (typeof saved.useManualSettings === "boolean") setUseManualSettings(saved.useManualSettings);
      if (typeof saved.frequentPhrases === "string") setFrequentPhrases(saved.frequentPhrases);
      if (saved.toneStyle && TONE_STYLES.includes(saved.toneStyle)) setToneStyle(saved.toneStyle);
      if (saved.emotionDepth && EMOTION_OPTIONS.includes(saved.emotionDepth)) setEmotionDepth(saved.emotionDepth);
      if (saved.emojiStyle && EMOJI_OPTIONS.includes(saved.emojiStyle)) setEmojiStyle(saved.emojiStyle);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (!showExportGuide && !showPrivacyGuide && !showConsentModal) return;

    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previousBodyOverflow = bodyStyle.overflow;
    const previousHtmlOverflow = htmlStyle.overflow;

    bodyStyle.overflow = "hidden";
    htmlStyle.overflow = "hidden";

    return () => {
      bodyStyle.overflow = previousBodyOverflow;
      htmlStyle.overflow = previousHtmlOverflow;
    };
  }, [showExportGuide, showPrivacyGuide, showConsentModal]);

  useEffect(() => {
    if (!openMenu) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (emotionMenuRef.current?.contains(target) || emojiMenuRef.current?.contains(target)) {
        return;
      }
      setOpenMenu(null);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openMenu]);

  useEffect(() => {
    if (!isSubmitting) return;

    const pool = isConversationBasedAnalysis ? CONVERSATION_BASED_HINTS : MEMORY_EMOTIONAL_HINTS;
    const pickRandom = (prev?: string) => {
      if (pool.length <= 1) return pool[0] || "";
      let next = pool[Math.floor(Math.random() * pool.length)] || "";
      while (next === prev) {
        next = pool[Math.floor(Math.random() * pool.length)] || "";
      }
      return next;
    };

    setAnalysisHint((prev) => pickRandom(prev));
    const interval = window.setInterval(() => {
      setAnalysisHint((prev) => pickRandom(prev));
    }, 1900);

    return () => window.clearInterval(interval);
  }, [isSubmitting, isConversationBasedAnalysis]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_TXT_FILE_SIZE) {
      setUploadedFileName("");
      setFileError("파일 크기는 500KB 이하만 업로드할 수 있습니다.");
      event.target.value = "";
      return;
    }

    setFileError("");
    setUploadedFileName(file.name);
  }

  function hasConversationSource() {
    return pastedConversation.trim().length > 0 || uploadedFileName.trim().length > 0;
  }

  function isConsentChecklistComplete() {
    return (
      consentChecklist.counterpartyConsent &&
      consentChecklist.rawDeletionAndVirtualModel &&
      consentChecklist.noMisuseAndResponsibility
    );
  }

  function buildConsentPayload(): StepFourConsent {
    return {
      version: "v1.0",
      checklist: consentChecklist,
      consent_timestamp: new Date().toISOString(),
    };
  }

  async function runAnalysisFlow(consent?: StepFourConsent) {
    const isConversationBased = hasConversationSource();
    setIsConversationBasedAnalysis(isConversationBased);
    setManualError("");
    setIsSubmitting(true);
    setNotice("");
    const startedAt = Date.now();

    const payload: StepFourData = {
      pastedConversation: pastedConversation.trim(),
      uploadedFileName: uploadedFileName || undefined,
      useManualSettings,
      frequentPhrases: frequentPhrases.trim(),
      nickname: "",
      toneStyle,
      emotionDepth,
      emojiStyle,
      consent: consent || undefined,
      consent_timestamp: consent?.consent_timestamp,
      is_raw_data_deleted: false,
      step: 4,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    try {
      await persistOnboardingStep(4, payload);
    } catch (error) {
      console.error("[step-4] remote save failed, continue local flow", error);
    }

    const stepInput = loadStepInputsFromLocalStorage();
    if (!stepInput) {
      setIsSubmitting(false);
      setNotice("분석에 필요한 단계 데이터를 찾을 수 없습니다. 1단계부터 다시 진행해주세요.");
      return;
    }

    try {
      const analysis = analyzePersonaMock(stepInput);
      const runtime = buildPersonaRuntime(analysis);
      savePersonaAnalysis(analysis);
      savePersonaRuntime(runtime);
    } catch (error) {
      console.error("[step-4] analysis generation failed", error);
      setNotice("분석 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setIsSubmitting(false);
      return;
    }

    // 분석 완료 직후, DB에 저장된 원문 대화/파일명은 즉시 비웁니다.
    const sanitizedPayload: StepFourData = {
      ...payload,
      pastedConversation: "",
      uploadedFileName: undefined,
      is_raw_data_deleted: true,
      sensitiveDataClearedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await persistOnboardingStep(4, sanitizedPayload);
    } catch (error) {
      console.error("[step-4] sensitive payload cleanup failed", error);
    }

    try {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_ANALYZING_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, MIN_ANALYZING_MS - elapsed));
      }
      router.push("/chat");
    } catch (error) {
      console.error("[step-4] analysis flow failed", error);
      setNotice("분석 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setIsSubmitting(false);
    }
  }

  async function handleConsentConfirm() {
    if (!isConsentChecklistComplete()) {
      setConsentError("필수 동의 항목 3개를 모두 체크해주세요.");
      if (!isRequiredConsentOpen) {
        setIsRequiredConsentOpen(true);
      }
      window.setTimeout(() => {
        requiredConsentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 120);
      if (typeof window !== "undefined") {
        window.alert("필수 확인 사항 3개를 모두 체크해주세요.");
      }
      return;
    }

    setConsentError("");
    setShowConsentModal(false);
    await runAnalysisFlow(buildConsentPayload());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (useManualSettings && !toneStyle) {
      setManualError("말투 및 스타일을 선택해주세요.");
      setNotice("");
      return;
    }

    if (hasConversationSource()) {
      setConsentError("");
      setShowConsentModal(true);
      return;
    }

    await runAnalysisFlow();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
      <header className="fixed top-0 z-50 w-full border-b border-[#afb3ac]/25 bg-[#faf9f5]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:px-12">
          <div className="font-headline text-2xl font-bold tracking-tight text-[#4a626d]">보고파</div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#655d5a]">Step 4/4</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#edeee8]">
              <div className="h-full w-full bg-[#4a626d] transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-32 pt-20 md:px-6 md:pb-12 md:pt-24">
        <div className="relative w-full max-w-xl overflow-visible rounded-none bg-transparent p-0 shadow-none md:overflow-hidden md:rounded-[2rem] md:bg-white md:p-12 md:shadow-[0_20px_40px_rgba(47,52,46,0.06)]">
          <div className="absolute -right-10 -top-10 -z-0 hidden h-40 w-40 bg-[#cde6f4]/20 [border-radius:40%_60%_70%_30%/40%_50%_60%_50%] md:block" />

          <div className="relative z-10">
            <div className="mb-8 text-center md:text-left">
              <h1 className="font-headline mb-3 text-3xl font-bold tracking-tight text-[#4a626d] md:text-4xl">
                이전에 나눴던 대화가 있다면
                <br />
                붙여넣거나 업로드해주세요.
              </h1>
              <p className="flex flex-wrap justify-center gap-x-1 gap-y-0 rounded-xl border border-[#f3c3c8] bg-[#ffecef] px-4 py-3 text-sm font-semibold text-[#9f403d] md:justify-start md:text-base">
                <span className="whitespace-nowrap">입력한 데이터는 분석 목적에만 사용되며,</span>
                <span className="whitespace-nowrap">분석 완료 후 삭제됩니다.</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowExportGuide(false);
                  setShowPrivacyGuide(true);
                }}
                className="mt-2 inline-flex text-sm font-semibold text-[#9f403d] underline underline-offset-4 transition-opacity hover:opacity-80"
              >
                자세히 보기
              </button>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div
                className={`overflow-hidden transition-all duration-500 ${
                  useManualSettings
                    ? "pointer-events-none max-h-0 -translate-y-2 opacity-0"
                    : "max-h-[900px] translate-y-0 opacity-100"
                }`}
              >
                <div className="space-y-6 pb-1">
                  <section className="rounded-2xl bg-white p-5 shadow-[0_12px_32px_rgba(48,51,46,0.04)]">
                    <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#4a626d]">
                      <PasteIcon />
                      대화 내용 붙여넣기
                    </label>
                    <textarea
                      value={pastedConversation}
                      onChange={(e) => setPastedConversation(e.target.value)}
                      rows={2}
                      className="min-h-[56px] w-full resize-none rounded-xl border-none bg-[#f4f4ef] p-4 text-[#30332e] outline-none ring-0 transition-all duration-300 focus:bg-white focus:ring-2 focus:ring-[#bfd8e5]"
                      placeholder="카카오톡 대화 내용이나 메신저 기록을 복사해서 붙여넣어 주세요."
                    />
                  </section>

                  <section className="relative rounded-2xl border-2 border-dashed border-[#afb3ac]/40 bg-[#f4f4ef] p-5 text-center transition-colors hover:bg-[#e8e9e2]">
                    <button
                      type="button"
                      onClick={() => setShowExportGuide(true)}
                      className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-[#afb3ac]/60 bg-white text-base font-bold text-[#4a626d] transition-colors hover:bg-[#f4f4ef]"
                      aria-label="카카오톡 채팅 내보내기 안내 보기"
                    >
                      ?
                    </button>
                    <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-[#cde6f4] text-[#4a626d]">
                      <UploadFileIcon />
                    </div>
                    <h3 className="mb-1 font-semibold text-[#30332e]">대화 파일 업로드</h3>
                    <p className="mb-3 text-xs text-[#5d605a]">.txt 파일 형식을 지원합니다 (최대 500KB, 약 1년간 대화 내용)</p>
                    <label className="inline-flex cursor-pointer items-center rounded-full bg-white px-4 py-2 text-xs font-bold text-[#4a626d] shadow-sm transition-all hover:shadow-md active:scale-[0.98]">
                      파일 선택하기
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                    {uploadedFileName ? <p className="mt-3 text-sm text-[#4a626d]">선택됨: {uploadedFileName}</p> : null}
                    {fileError ? <p className="mt-2 text-sm text-[#9f403d]">{fileError}</p> : null}
                  </section>

                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-[#afb3ac]/30" />
                    <span className="text-xs font-semibold tracking-widest text-[#787c75]">OR</span>
                    <div className="h-px flex-1 bg-[#afb3ac]/30" />
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#ece0dc]/35 p-5 transition-colors hover:bg-[#ece0dc]/55">
                <input
                  type="checkbox"
                  checked={useManualSettings}
                  onChange={(e) => {
                    const nextChecked = e.target.checked;
                    setUseManualSettings(nextChecked);
                    if (!e.target.checked) setManualError("");
                    if (nextChecked) {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className="mt-1 h-5 w-5 rounded-md border-[#afb3ac] text-[#4a626d] focus:ring-[#bfd8e5]"
                />
                <div>
                  <span className="mb-1 block font-bold text-[#58504d]">대화 내용 없이 직접 설정할게요</span>
                  <span className="block text-sm text-[#58504d]/75">
                    기존 대화 내용이 없어도 선호하는 대화 스타일을 정의할 수 있습니다.
                  </span>
                </div>
              </label>

              {useManualSettings ? (
                <section className="space-y-6 rounded-2xl bg-white p-6 shadow-[0_12px_32px_rgba(48,51,46,0.04)]">
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <label className="px-1 text-sm font-bold text-[#5d605a]">자주 사용하는 문구</label>
                      <input
                        value={frequentPhrases}
                        onChange={(e) => setFrequentPhrases(e.target.value)}
                        type="text"
                        placeholder="예: '밥 먹었어?', '잘 자'"
                        className="w-full rounded-xl border-none bg-[#f4f4ef] p-3 text-[#30332e] outline-none ring-0 focus:ring-2 focus:ring-[#bfd8e5]"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="px-1 text-sm font-bold text-[#5d605a]">말투 및 스타일</label>
                    <div className="grid grid-cols-2 gap-3">
                      {TONE_STYLES.map((style) => {
                        const isActive = toneStyle === style;
                        return (
                          <button
                            key={style}
                            type="button"
                            onClick={() => {
                              setToneStyle(style);
                              if (manualError) setManualError("");
                            }}
                            className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 md:text-base ${
                              isActive
                                ? "border-[#4a626d] bg-white text-[#2f342e] shadow-sm"
                                : "border-transparent bg-[#f4f4ef] text-[#2f342e] hover:bg-white"
                            }`}
                          >
                            {style}
                          </button>
                        );
                      })}
                    </div>
                    {manualError ? <p className="ml-1 text-sm text-[#9f403d]">{manualError}</p> : null}
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="px-1 text-sm font-bold text-[#5d605a]">감정의 깊이</label>
                      <div ref={emotionMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenMenu(openMenu === "emotion" ? null : "emotion")}
                          className="flex w-full items-center justify-between rounded-xl bg-[#f4f4ef] p-3 text-left text-[#30332e] outline-none ring-0 transition-all focus:ring-2 focus:ring-[#bfd8e5]"
                        >
                          <span>{emotionDepth}</span>
                          <span className={`transition-transform ${openMenu === "emotion" ? "rotate-180" : ""}`}>
                            ▾
                          </span>
                        </button>
                        {openMenu === "emotion" ? (
                          <div className="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-xl border border-[#afb3ac]/40 bg-white p-1 shadow-[0_12px_28px_rgba(48,51,46,0.14)]">
                            {EMOTION_OPTIONS.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  setEmotionDepth(option);
                                  setOpenMenu(null);
                                }}
                                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                  emotionDepth === option
                                    ? "bg-[#cde6f4]/45 text-[#3e5560]"
                                    : "text-[#30332e] hover:bg-[#f4f4ef]"
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="px-1 text-sm font-bold text-[#5d605a]">이모지 사용 스타일</label>
                      <div ref={emojiMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenMenu(openMenu === "emoji" ? null : "emoji")}
                          className="flex w-full items-center justify-between rounded-xl bg-[#f4f4ef] p-3 text-left text-[#30332e] outline-none ring-0 transition-all focus:ring-2 focus:ring-[#bfd8e5]"
                        >
                          <span>{emojiStyle}</span>
                          <span className={`transition-transform ${openMenu === "emoji" ? "rotate-180" : ""}`}>
                            ▾
                          </span>
                        </button>
                        {openMenu === "emoji" ? (
                          <div className="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-xl border border-[#afb3ac]/40 bg-white p-1 shadow-[0_12px_28px_rgba(48,51,46,0.14)]">
                            {EMOJI_OPTIONS.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  setEmojiStyle(option);
                                  setOpenMenu(null);
                                }}
                                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                  emojiStyle === option
                                    ? "bg-[#cde6f4]/45 text-[#3e5560]"
                                    : "text-[#30332e] hover:bg-[#f4f4ef]"
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <div className="pt-0 md:pt-2">
                <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] grid grid-cols-2 gap-2 md:static md:left-auto md:right-auto md:z-auto md:gap-4">
                  <Link
                    href="/step-3"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#4a626d] bg-white px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#cde6f4]/25 active:scale-[0.98] md:rounded-2xl md:text-lg md:font-bold md:shadow-none"
                  >
                    <ArrowLeftIcon />
                    이전
                  </Link>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:rounded-2xl md:text-lg md:font-bold md:shadow-lg"
                  >
                    {isSubmitting ? (
                      <>
                        <SpinnerIcon />
                        저장 중...
                      </>
                    ) : (
                      <>
                        분석 후 대화 시작
                        <SparkleIcon />
                      </>
                    )}
                  </button>
                </div>

                {notice ? <p className="mt-3 text-center text-sm text-[#4a626d]">{notice}</p> : null}
              </div>
            </form>
          </div>
        </div>
      </main>

      {showConsentModal ? (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center md:justify-center md:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="동의창 닫기"
            onClick={() => setShowConsentModal(false)}
          />
          <section className="relative z-[91] w-full max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-18px_44px_rgba(48,51,46,0.24)] md:max-h-[90vh] md:max-w-2xl md:rounded-3xl md:p-8 md:pb-8 md:shadow-[0_24px_60px_rgba(48,51,46,0.24)]">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-headline text-2xl font-bold text-[#2f342e]">[필수] 개인정보 수집 및 페르소나 생성 동의</h2>
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-[#f4f4ef] text-[#4a626d] transition-colors hover:bg-[#e8e9e2]"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <details open className="rounded-xl border border-[#afb3ac]/40 bg-[#f9faf7]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#2f342e]">
                  수집 및 이용 목적
                </summary>
                <p className="px-4 pb-4 text-sm leading-relaxed text-[#4a4a4a]">
                  카카오톡 대화 데이터 분석을 통한 개인화 AI 페르소나 생성 및 대화 서비스 제공
                </p>
              </details>

              <details className="rounded-xl border border-[#afb3ac]/40 bg-[#f9faf7]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#2f342e]">
                  처리 방식 · 보유 및 이용 기간 · 동의 거부 권리
                </summary>
                <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-[#4a4a4a]">
                  <p>
                    <span className="font-semibold text-[#2f342e]">처리 방식:</span> 업로드된 대화 원문은 AI 분석 즉시
                    서버에서 영구 삭제되며, 분석 결과(말투, 호칭 등 성격 레시피)만 가명화되어 저장됩니다.
                  </p>
                  <p>
                    <span className="font-semibold text-[#2f342e]">보유 및 이용 기간:</span> 페르소나 삭제 시 혹은 서비스 탈퇴
                    시까지 (분석 원문은 처리 직후 즉시 파기)
                  </p>
                  <p>
                    <span className="font-semibold text-[#2f342e]">동의 거부 권리:</span> 귀하는 동의를 거부할 수 있으나, 이 경우
                    대화 기반 페르소나 생성 서비스를 이용할 수 없습니다.
                  </p>
                </div>
              </details>
            </div>

            <div className="mt-5" ref={requiredConsentRef}>
              <div className="rounded-xl border border-[#afb3ac]/40 bg-white">
                <button
                  type="button"
                  onClick={() => setIsRequiredConsentOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#2f342e]"
                >
                  <span>필수 확인 사항</span>
                  <span className={`transition-transform duration-300 ${isRequiredConsentOpen ? "rotate-180" : ""}`}>▾</span>
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isRequiredConsentOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-3 px-4 pb-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consentChecklist.counterpartyConsent}
                      onChange={(e) => setConsentChecklist((prev) => ({ ...prev, counterpartyConsent: e.target.checked }))}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-[#afb3ac] text-[#4a626d] focus:ring-[#bfd8e5]"
                    />
                    <span className="text-sm leading-relaxed text-[#2f342e]">
                      업로드하는 대화의 상대방으로부터 해당 데이터를 AI 서비스에 활용함에 대해 충분한 동의를 얻었음을 확약합니다.
                    </span>
                  </label>

                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consentChecklist.rawDeletionAndVirtualModel}
                      onChange={(e) =>
                        setConsentChecklist((prev) => ({ ...prev, rawDeletionAndVirtualModel: e.target.checked }))
                      }
                      className="mt-1 h-5 w-5 shrink-0 rounded border-[#afb3ac] text-[#4a626d] focus:ring-[#bfd8e5]"
                    />
                    <span className="text-sm leading-relaxed text-[#2f342e]">
                      분석 완료 후 대화 원문은 즉시 파기되며, 생성된 AI는 실제 인물과 무관한 &apos;가상의 대화 모델&apos;임을
                      이해합니다.
                    </span>
                  </label>

                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consentChecklist.noMisuseAndResponsibility}
                      onChange={(e) =>
                        setConsentChecklist((prev) => ({ ...prev, noMisuseAndResponsibility: e.target.checked }))
                      }
                      className="mt-1 h-5 w-5 shrink-0 rounded border-[#afb3ac] text-[#4a626d] focus:ring-[#bfd8e5]"
                    />
                    <span className="text-sm leading-relaxed text-[#2f342e]">
                      본 서비스를 통해 생성된 페르소나를 타인을 비방하거나 부적절한 목적으로 사용하지 않으며, 이를 위반하여
                      발생하는 모든 책임은 사용자 본인에게 있음을 동의합니다.
                    </span>
                  </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <details className="mt-5 rounded-xl border border-[#c9dbe3] bg-[#eef5f8]">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-[#3e5560] md:text-base">
                데이터 보안 안내
              </summary>
              <div className="px-4 pb-4 text-xs leading-relaxed text-[#3e5560] md:text-sm">
                <p>
                  본 서비스는 OpenAI API의 엔터프라이즈 보안 정책을 준수하며, 전송된 데이터는 AI 모델의 학습 데이터로 사용되지
                  않습니다.
                </p>
                <p className="mt-2">
                  분석이 완료되는 즉시 귀하의 원문 데이터는 &apos;디지털 파쇄(Shredding)&apos; 과정을 거쳐 누구도 복구할 수
                  없는 상태가 됩니다.
                </p>
              </div>
            </details>

            {consentError ? <p className="mt-3 text-sm font-semibold text-[#9f403d]">{consentError}</p> : null}

            <div className="mt-5">
              <button
                type="button"
                onClick={handleConsentConfirm}
                disabled={isSubmitting}
                className="w-full rounded-xl bg-[#4a626d] px-4 py-3 text-sm font-semibold text-[#f0f9ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                동의하고 분석 시작
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showExportGuide ? (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center md:justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="안내 닫기"
            onClick={() => setShowExportGuide(false)}
          />
          <section className="relative w-full rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(48,51,46,0.18)] md:max-w-xl md:rounded-3xl md:pb-6 md:shadow-[0_20px_44px_rgba(48,51,46,0.22)]">
            <div className="mx-auto max-w-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-headline text-2xl font-bold text-[#2f342e]">카카오톡 채팅 내보내기</h2>
                <button
                  type="button"
                  onClick={() => setShowExportGuide(false)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-[#f4f4ef] text-[#4a626d] transition-colors hover:bg-[#e8e9e2]"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-[15px] leading-relaxed text-[#5d605a] md:text-base">
                <div>
                  <p className="mb-1 text-base font-semibold text-[#2f342e]">iOS</p>
                  <p>채팅방 상단 메뉴 → 우측 상단 `≡` → `대화 내용 내보내기` → `텍스트만 보내기`</p>
                </div>
                <div>
                  <p className="mb-1 text-base font-semibold text-[#2f342e]">Android</p>
                  <p>채팅방 우측 상단 `⋮` → `채팅방 설정` → `대화 내용 내보내기` → `텍스트 파일(.txt)` 저장</p>
                </div>
                <p className="text-sm text-[#787c75]">
                  내보낸 `.txt` 파일에서 민감한 정보는 업로드 전에 한 번 더 확인해주세요.
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {showPrivacyGuide ? (
        <div className="fixed inset-0 z-[85] flex items-end md:items-center md:justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="안내 닫기"
            onClick={() => setShowPrivacyGuide(false)}
          />
          <section className="relative w-full rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(48,51,46,0.18)] md:max-w-xl md:rounded-3xl md:pb-6 md:shadow-[0_20px_44px_rgba(48,51,46,0.22)]">
            <div className="mx-auto max-w-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-headline text-2xl font-bold text-[#2f342e]">개인정보 보호 안내</h2>
                <button
                  type="button"
                  onClick={() => setShowPrivacyGuide(false)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-[#f4f4ef] text-[#4a626d] transition-colors hover:bg-[#e8e9e2]"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-[15px] leading-relaxed text-[#5d605a] md:text-base">
                <p>
                  과거 대화형 AI 서비스의 개인정보 이슈 사례를 중요한 교훈으로 보고,
                  보고파는 대화 데이터 처리 전 과정을 기술적/관리적으로 통제하고 있습니다.
                </p>
                <div>
                  <p className="mb-1 text-base font-semibold text-[#2f342e]">기술적 보호</p>
                  <p>전송 구간 암호화, 분석 완료 후 대화 내용 즉시 삭제, 보관 최소화 정책을 기본 적용합니다.</p>
                </div>
                <div>
                  <p className="mb-1 text-base font-semibold text-[#2f342e]">관리적 보호</p>
                  <p>권한 최소화, 접근 이력 점검, 내부 처리 절차 문서화를 통해 운영 과정의 오남용을 방지합니다.</p>
                </div>
                <p className="text-sm text-[#787c75]">
                  개인정보 처리방침과 운영 정책은 서비스 고지에서 확인할 수 있으며, 문의 시 상세히 안내해드립니다.
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isSubmitting ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#faf9f5]/88 backdrop-blur-sm">
          <section className="mx-6 w-full max-w-md rounded-3xl border border-[#afb3ac]/35 bg-white px-6 py-8 text-center shadow-[0_24px_60px_rgba(47,52,46,0.22)]">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-[#cde6f4]/60">
              <svg viewBox="0 0 24 24" className="h-11 w-11 animate-spin text-[#4a626d]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            </div>
            <h3 className="font-headline text-2xl font-bold text-[#2f342e]">기억을 되살리는 중이에요</h3>
            <p className="mt-3 min-h-[48px] text-base leading-relaxed text-[#5d605a]">
              {analysisHint}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
