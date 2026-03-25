"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadStepInputsFromLocalStorage,
  savePersonaRuntime,
} from "@/lib/persona/storage";
import { persistOnboardingStep } from "@/lib/onboarding-client";
import { PersonaAnalyzeInput } from "@/types/persona";
import HomeConfirmModal from "@/app/_components/HomeConfirmModal";
import { FREE_PLAN_LIMITS, PlanLimits } from "@/lib/memory-pass/config";

const STORAGE_KEY = "bogopa_profile_step4";
const STEP3_KEY = "bogopa_profile_step3";
const FREQUENT_PHRASE_EXAMPLES = [
  "예: 밥은 먹었어?",
  "예: 오늘 하루 어땠어?",
  "예: 너무 무리하지 마",
  "예: 천천히 해도 괜찮아",
  "예: 내가 네 편이야",
  "예: 잠은 잘 잤어?",
  "예: 따뜻한 거라도 챙겨 먹자",
  "예: 지금도 충분히 잘하고 있어",
  "예: 괜찮아, 하나씩 해보자",
  "예: 힘들면 바로 말해줘",
  "예: 물 좀 마셔",
  "예: 잘 버텼어",
  "예: 천천히 말해줘",
  "예: 내가 듣고 있어",
  "예: 오늘도 고생했어",
  "예: 잠깐 쉬자",
  "예: 괜찮아, 있어줄게",
  "예: 지금 어때?",
  "예: 많이 힘들었지",
  "예: 내가 안아줄게",
];
const MEMORY_PLACEHOLDER_EXAMPLES = [
  "예: 제주도 바닷가에서 같이 산책하던 날",
  "예: 비 오는 날 우산 하나로 같이 걸었던 저녁",
  "예: 생일에 직접 끓여준 미역국",
  "예: 야식 먹으며 새벽까지 수다 떨던 날",
  "예: 첫 월급 받고 같이 외식했던 날",
  "예: 시험 끝나고 늦은 밤에 같이 웃었던 시간",
  "예: 명절 아침 같이 전 부치던 기억",
  "예: 힘든 날 말없이 옆에 있어줬던 순간",
  "예: 여행 가는 기차 안에서 나눈 대화",
  "예: 퇴근길에 데리러 와줘서 고마웠던 날",
  "예: 공원 벤치에서 오래 앉아 있던 날",
  "예: 첫눈 오던 밤 같이 걷던 길",
  "예: 병원 다녀오고 같이 죽 먹었던 날",
  "예: 늦은 밤 전화로 위로해준 순간",
  "예: 시험 전날 끝까지 응원해준 밤",
  "예: 장 보러 가서 함께 저녁 준비한 날",
  "예: 아무 말 없이 손잡고 걷던 시간",
  "예: 버스 창가에서 같이 노래 듣던 날",
  "예: 아침 인사 문자로 힘났던 순간",
  "예: 서로 미안하다고 말하고 풀린 날",
];

const DROPDOWN_OPTIONS = {
  politeness: ["편안한 반말", "정중한 존댓말", "반말+존댓말 혼용", "다정하지만 깍듯함"],
  replyTempo: ["급한 성격", "적당히 차분한 성격", "신중하고 느린 편"],
  empathyStyle: ["감성 공감 우선", "차분한 이성적 위로", "해결책 중심의 조언"],
};

type Step3Raw = {
  personaName?: string;
  userNickname?: string;
  relationship?: string;
  personaImageUrl?: string;
};
type UserProfileResponse = {
  birthDate: string | null;
  mbti: string | null;
  interests: string[];
};

type Step4Overrides = {
  frequentPhrases: string[];
  politeness: string;
  replyTempo: string;
  empathyStyle: string;
  memories: string[];
};

type Step4Raw = {
  frequentPhrases?: string;
  nickname?: string;
  toneStyle?: string;
  emotionDepth?: string;
  overrides?: Partial<Step4Overrides>;
};

const DEFAULT_OVERRIDES: Step4Overrides = {
  frequentPhrases: [],
  politeness: DROPDOWN_OPTIONS.politeness[0],
  replyTempo: DROPDOWN_OPTIONS.replyTempo[1],
  empathyStyle: DROPDOWN_OPTIONS.empathyStyle[0],
  memories: [],
};
const MIN_SUBMIT_LOADING_MS = 4000;

function pickRandomExample(examples: string[], exclude?: string) {
  if (examples.length === 0) return "";
  if (examples.length === 1) return examples[0];

  let next = examples[Math.floor(Math.random() * examples.length)] || examples[0];
  if (!exclude) return next;

  let guard = 0;
  while (next === exclude && guard < 8) {
    next = examples[Math.floor(Math.random() * examples.length)] || examples[0];
    guard += 1;
  }
  return next;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function splitTextList(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(/[\n,|/]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanList(values: string[], max = 10) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function toId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `persona-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function calculateAgeFromBirthDate(birthDate: string | null) {
  if (!birthDate) return null;
  const [yearRaw, monthRaw, dayRaw] = birthDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const today = new Date();
  let age = today.getFullYear() - year;
  const hasBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hasBirthdayThisYear) age -= 1;
  return age;
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
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

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

function Dropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.16em] text-[#f0f5f2]/70">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#242926] px-4 py-3 text-sm font-bold text-[#f0f5f2] transition-colors hover:bg-[#2b322f]"
      >
        <span>{value}</span>
        <svg className={`h-4 w-4 text-[#b8c3be] transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#1f2421] shadow-xl">
          {options.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`block w-full px-4 py-3 text-left text-sm font-bold transition-colors ${
                option === value ? "bg-[#4a626d] text-[#f0f9ff]" : "text-[#e6ece8] hover:bg-[#323a36]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ListEditor({
  label,
  values,
  placeholderExamples,
  onChange,
  maxItems,
  maxChars,
  onLimitReached,
}: {
  label: string;
  values: string[];
  placeholderExamples: string[];
  onChange: (values: string[]) => void;
  maxItems: number;
  maxChars: number;
  onLimitReached?: () => void;
}) {
  const [rowPlaceholders, setRowPlaceholders] = useState<string[]>([]);

  useEffect(() => {
    setRowPlaceholders((prev) => {
      if (values.length === prev.length) return prev;
      if (values.length < prev.length) return prev.slice(0, values.length);

      const next = [...prev];
      while (next.length < values.length) {
        next.push(pickRandomExample(placeholderExamples, next[next.length - 1]));
      }
      return next;
    });
  }, [values.length, placeholderExamples]);

  return (
    <div className="space-y-3">
      <label className="block text-xs font-extrabold uppercase tracking-[0.16em] text-[#f0f5f2]/70">{label}</label>
      {values.map((item, index) => (
        <div key={`${label}-${index}`} className="flex gap-2">
          <input
            type="text"
            value={item}
            placeholder={rowPlaceholders[index] || placeholderExamples[0] || ""}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value.slice(0, maxChars);
              onChange(next);
            }}
            className="flex-1 rounded-xl bg-[#f4f4ef] px-4 py-3 text-sm font-semibold text-[#2f342e] outline-none ring-0 focus:ring-2 focus:ring-[#4a626d]/25"
          />
          <button
            type="button"
            onClick={() => {
              onChange(values.filter((_, i) => i !== index));
              setRowPlaceholders((prev) => prev.filter((_, i) => i !== index));
            }}
            className="rounded-xl px-3 text-[#9f403d] hover:bg-[#9f403d]/10"
          >
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          if (values.length >= maxItems) {
            onLimitReached?.();
            return;
          }
          onChange([...values, ""]);
          setRowPlaceholders((prev) => [...prev, pickRandomExample(placeholderExamples, prev[prev.length - 1])]);
        }}
        className="w-full rounded-2xl border border-dashed border-[#f0f5f2]/45 py-3.5 text-sm font-extrabold text-[#f0f5f2]/80 hover:border-[#f0f5f2]/80 hover:text-[#f0f5f2]"
      >
        + 항목 추가
      </button>
      <p className="text-xs text-[#f0f5f2]/65">최대 {maxItems}개 · 항목당 최대 {maxChars}자</p>
    </div>
  );
}

function buildPersonaJson(
  stepInputs: PersonaAnalyzeInput,
  overrides: Step4Overrides,
  selectedAvatarUrl: string | null,
  userProfile: { age: number | null; mbti: string; interests: string[] },
) {
  const now = new Date().toISOString();
  const frequentPhrases = cleanList(overrides.frequentPhrases, 12);
  const memories = cleanList(overrides.memories, 12);
  const empathyFirst = overrides.empathyStyle === "감성 공감 우선";
  const alias = stepInputs.step3.userNickname.trim();

  return {
    personaId: toId(),
    createdAt: now,
    updatedAt: now,
    userName: stepInputs.step1.userName.trim(),
    displayName: stepInputs.step3.personaName.trim(),
    relation: stepInputs.step3.relation.trim(),
    gender: stepInputs.step3.personaGender || "",
    avatarUrl: selectedAvatarUrl || stepInputs.step3.avatarUrl || "",
    goal: stepInputs.step2.primaryGoal || "",
    customGoalText: stepInputs.step2.customGoalText.trim(),
    summary: "",
    style: {
      tone: [],
      politeness: overrides.politeness || "",
      sentenceLength: "",
      replyTempo: overrides.replyTempo || "",
      humorStyle: "",
    },
    addressing: {
      callsUserAs: alias ? [alias] : [],
      userCallsPersonaAs: [],
    },
    expressions: {
      frequentPhrases,
      emojiExamples: [],
      laughterPatterns: [],
      sadnessPatterns: [],
      typoExamples: [],
    },
    personaMeta: {
      occupation: stepInputs.step3.personaOccupation.trim(),
      workAttitudeSummary: "",
      workTendencyTags: [],
      selfTalkStyle: "",
    },
    behavior: {
      empathyFirst,
      feedbackStyle: "",
      preferredReplyLength: "",
      conflictStyle: "",
    },
    topics: {
      frequent: [],
      avoid: [],
    },
    memories,
    sampleReplies: [],
    uncertainty: [],
    userProfile: {
      age: userProfile.age,
      mbti: userProfile.mbti,
      interests: userProfile.interests,
    },
    safety: {
      doNotClaimLiteralIdentity: true as const,
      doNotInventSpecificFacts: true as const,
    },
  };
}

export default function StepThreePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);
  const [relationLabel, setRelationLabel] = useState("");
  const [step3Nickname, setStep3Nickname] = useState("너");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Step4Overrides>(DEFAULT_OVERRIDES);
  const [planLimits, setPlanLimits] = useState<PlanLimits>(FREE_PLAN_LIMITS);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [profileMeta, setProfileMeta] = useState<{ age: number | null; mbti: string; interests: string[] }>({
    age: null,
    mbti: "",
    interests: [],
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });

    const step3 = safeParse<Step3Raw>(window.localStorage.getItem(STEP3_KEY));
    const step4 = safeParse<Step4Raw>(window.localStorage.getItem(STORAGE_KEY));
    if (!step3) {
      router.replace("/step-1");
      return;
    }

    setRelationLabel(step3.relationship?.trim() || "");
    setStep3Nickname(step3.userNickname?.trim() || "너");
    setAvatarUrl(step3.personaImageUrl?.trim() || null);

    const fromOverrides = step4?.overrides || {};

    const frequentPhrases =
      fromOverrides.frequentPhrases && fromOverrides.frequentPhrases.length > 0
        ? fromOverrides.frequentPhrases
        : splitTextList(step4?.frequentPhrases);

    setOverrides({
      frequentPhrases,
      politeness: fromOverrides.politeness || DEFAULT_OVERRIDES.politeness,
      replyTempo: fromOverrides.replyTempo || DEFAULT_OVERRIDES.replyTempo,
      empathyStyle: fromOverrides.empathyStyle || DEFAULT_OVERRIDES.empathyStyle,
      memories: fromOverrides.memories || [],
    });

    void (async () => {
      try {
        const [memoryPassResponse, userProfileResponse] = await Promise.all([
          fetch("/api/memory-pass", { cache: "no-store" }),
          fetch("/api/user/profile", { cache: "no-store" }),
        ]);

        if (memoryPassResponse.ok) {
          const payload = (await memoryPassResponse.json()) as { isSubscribed?: boolean; limits?: PlanLimits };
          if (payload?.limits) setPlanLimits(payload.limits);
          setIsSubscribed(Boolean(payload?.isSubscribed));
        }

        if (userProfileResponse.ok) {
          const payload = (await userProfileResponse.json()) as { ok?: boolean; profile?: UserProfileResponse };
          const profile = payload.profile;
          if (profile) {
            setProfileMeta({
              age: calculateAgeFromBirthDate(profile.birthDate || null),
              mbti: (profile.mbti || "").trim().toUpperCase(),
              interests: Array.isArray(profile.interests)
                ? profile.interests
                    .map((item) => (typeof item === "string" ? item.trim() : ""))
                    .filter(Boolean)
                    .slice(0, 8)
                : [],
            });
          }
        }
      } catch {
        // keep free limits
      }
    })();
  }, [router]);

  useEffect(() => {
    setOverrides((prev) => ({
      ...prev,
      frequentPhrases: prev.frequentPhrases
        .slice(0, planLimits.phraseItemMaxCount)
        .map((item) => item.slice(0, planLimits.phraseItemCharMax)),
      memories: prev.memories
        .slice(0, planLimits.memoryItemMaxCount)
        .map((item) => item.slice(0, planLimits.memoryItemCharMax)),
    }));
  }, [planLimits]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const submitStartedAt = Date.now();
    const waitMinimumLoading = async () => {
      const elapsed = Date.now() - submitStartedAt;
      if (elapsed < MIN_SUBMIT_LOADING_MS) {
        await sleep(MIN_SUBMIT_LOADING_MS - elapsed);
      }
    };

    setIsSubmitting(true);
    setError("");

    const normalized: Step4Overrides = {
      ...overrides,
      frequentPhrases: cleanList(
        overrides.frequentPhrases.map((item) => item.slice(0, planLimits.phraseItemCharMax)),
        planLimits.phraseItemMaxCount,
      ),
      memories: cleanList(
        overrides.memories.map((item) => item.slice(0, planLimits.memoryItemCharMax)),
        planLimits.memoryItemMaxCount,
      ),
    };

    const payload = {
      pastedConversation: "",
      uploadedFileName: null,
      useManualSettings: true,
      frequentPhrases: normalized.frequentPhrases.join("\n"),
      nickname: step3Nickname,
      toneStyle: "",
      emotionDepth: "",
      emojiStyle: "상황에 맞게 적당히",
      mode: "manual_only",
      overrides: normalized,
      step: 3,
      updatedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      await persistOnboardingStep(3, payload);
    } catch (persistError) {
      console.warn("[step-3] remote save failed, continue local flow", persistError);
    }

    try {
      const stepInputs = loadStepInputsFromLocalStorage();
      if (!stepInputs) {
        throw new Error("1~3단계 데이터가 누락되어 분석을 진행할 수 없습니다.");
      }

      let resolvedProfileMeta = profileMeta;
      const shouldHydrateProfileMeta =
        resolvedProfileMeta.age === null &&
        !resolvedProfileMeta.mbti &&
        resolvedProfileMeta.interests.length === 0;

      if (shouldHydrateProfileMeta) {
        try {
          const response = await fetch("/api/user/profile", { cache: "no-store" });
          if (response.ok) {
            const payload = (await response.json()) as { ok?: boolean; profile?: UserProfileResponse };
            const profile = payload.profile;
            if (profile) {
              resolvedProfileMeta = {
                age: calculateAgeFromBirthDate(profile.birthDate || null),
                mbti: (profile.mbti || "").trim().toUpperCase(),
                interests: Array.isArray(profile.interests)
                  ? profile.interests
                      .map((item) => (typeof item === "string" ? item.trim() : ""))
                      .filter(Boolean)
                      .slice(0, 8)
                  : [],
              };
              setProfileMeta(resolvedProfileMeta);
            }
          }
        } catch {
          // fallback to current state
        }
      }

      const personaJson = buildPersonaJson(stepInputs, normalized, avatarUrl, resolvedProfileMeta);

      savePersonaRuntime(personaJson as any);

      try {
        const response = await fetch("/api/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatarUrl,
            runtime: personaJson,
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (response.status === 402 || response.status === 403) {
            router.push(`/payment?returnTo=${encodeURIComponent("/step-3")}`);
            return;
          }
          console.warn("[step-3] persona save failed, continue local flow", body.error || response.statusText);
        }
      } catch (dbError) {
        console.warn("[step-3] persona save failed, continue local flow", dbError);
      }

      await waitMinimumLoading();
      router.push(`/chat?id=${personaJson.personaId}`);
    } catch (submitError) {
      await waitMinimumLoading();
      const message = submitError instanceof Error ? submitError.message : "분석 중 오류가 발생했습니다.";
      setError(message);
      setIsSubmitting(false);
    }
  }

  function goToPayment() {
    router.push(`/payment?returnTo=${encodeURIComponent("/step-3")}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
      <header className="fixed top-0 z-50 w-full border-b border-[#afb3ac]/25 bg-[#faf9f5]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:px-12">
          <button
            type="button"
            onClick={() => setIsHomeModalOpen(true)}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <img src="/logo/bogopa%20logo.png" alt="보고파" className="h-8 w-auto object-contain" />
            <span className="font-headline text-2xl font-bold tracking-tight text-[#4a626d]">Bogopa</span>
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#655d5a]">Step 3/3</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#edeee8]">
              <div className="h-full w-full bg-[#4a626d] transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-32 pt-20 md:px-6 md:pb-12 md:pt-24">
        <div className="relative w-full max-w-xl overflow-visible rounded-none bg-transparent p-0 shadow-none md:overflow-hidden md:rounded-[2rem] md:bg-[#303733] md:p-12 md:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
          <div className="absolute -right-10 -top-10 -z-0 hidden h-40 w-40 bg-[#cde6f4]/20 [border-radius:40%_60%_70%_30%/40%_50%_60%_50%] md:block" />

          <div className="relative z-10">
            <div className="mb-8 text-center md:text-left">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-[#2f342e] md:text-4xl md:text-[#f0f5f2]">
              기억을 마지막으로 다듬어요
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#655d5a] md:text-[#f0f5f2]/80">
                마지막 단계에요.
                {relationLabel ? ` ${relationLabel}와의` : ""} 대화에서 꼭 남기고 싶은 말투와 기억만 가볍게 정리하면 바로 다시 만날 수 있어요.
              </p>
            </div>

            <form className="space-y-7" onSubmit={handleSubmit}>
              <section className="rounded-2xl bg-[#303733] p-6 shadow-[0_16px_32px_rgba(0,0,0,0.2)] md:border md:border-white/10 md:bg-[#38403b]">
                <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#f0f5f2]/70">대화 스타일</h2>
                <div className="grid grid-cols-1 gap-4">
                  <Dropdown
                    label="정중함 정도"
                    options={DROPDOWN_OPTIONS.politeness}
                    value={overrides.politeness}
                    onChange={(value) => setOverrides((prev) => ({ ...prev, politeness: value }))}
                  />
                  <Dropdown
                    label="성격"
                    options={DROPDOWN_OPTIONS.replyTempo}
                    value={overrides.replyTempo}
                    onChange={(value) => setOverrides((prev) => ({ ...prev, replyTempo: value }))}
                  />
                  <Dropdown
                    label="공감 방식"
                    options={DROPDOWN_OPTIONS.empathyStyle}
                    value={overrides.empathyStyle}
                    onChange={(value) => setOverrides((prev) => ({ ...prev, empathyStyle: value }))}
                  />
                </div>
              </section>

              <section className="rounded-2xl bg-[#303733] p-6 shadow-[0_16px_32px_rgba(0,0,0,0.2)] md:border md:border-white/10 md:bg-[#38403b]">
                <ListEditor
                  label="자주 쓰는 문구"
                  values={overrides.frequentPhrases}
                  placeholderExamples={FREQUENT_PHRASE_EXAMPLES}
                  onChange={(values) => setOverrides((prev) => ({ ...prev, frequentPhrases: values }))}
                  maxItems={planLimits.phraseItemMaxCount}
                  maxChars={planLimits.phraseItemCharMax}
                  onLimitReached={isSubscribed ? undefined : goToPayment}
                />
              </section>

              <section className="rounded-2xl bg-[#303733] p-6 shadow-[0_16px_32px_rgba(0,0,0,0.2)] md:border md:border-white/10 md:bg-[#38403b]">
                <ListEditor
                  label="핵심 기억"
                  values={overrides.memories}
                  placeholderExamples={MEMORY_PLACEHOLDER_EXAMPLES}
                  onChange={(values) => setOverrides((prev) => ({ ...prev, memories: values }))}
                  maxItems={planLimits.memoryItemMaxCount}
                  maxChars={planLimits.memoryItemCharMax}
                  onLimitReached={isSubscribed ? undefined : goToPayment}
                />
              </section>

              {!isSubscribed ? (
                <button
                  type="button"
                  onClick={goToPayment}
                  className="w-full rounded-2xl border border-[#f0f5f2]/30 bg-white/5 px-4 py-3 text-sm font-bold text-[#f0f5f2] hover:bg-white/10"
                >
                  기억 패스 등록하고 제한 해제하기
                </button>
              ) : null}

              <div className="pt-0 md:pt-2">
                <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] grid grid-cols-2 gap-2 md:static md:left-auto md:right-auto md:z-auto md:gap-4">
                  <Link
                    href="/step-2"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#4a626d] bg-white px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#f4f4ef] active:scale-[0.98] md:rounded-2xl md:text-lg md:font-bold md:shadow-none"
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
                        분석 중...
                      </>
                    ) : (
                      <>
                        채팅 시작
                        <span className="transition-transform group-hover:translate-x-1">
                          <ArrowRightIcon />
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {error ? <p className="mt-3 text-center text-sm text-[#9f403d]">{error}</p> : null}
              </div>
            </form>
          </div>
        </div>
      </main>
      <HomeConfirmModal isOpen={isHomeModalOpen} onClose={() => setIsHomeModalOpen(false)} />
    </div>
  );
}
