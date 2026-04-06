"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadStepInputsFromLocalStorage,
  savePersonaRuntime,
} from "@/lib/persona/storage";
import { clearOnboardingDraft, persistOnboardingStep } from "@/lib/onboarding-client";
import { PersonaAnalyzeInput } from "@/types/persona";
import HomeConfirmModal from "@/app/_components/HomeConfirmModal";
import { FREE_PLAN_LIMITS, PlanLimits } from "@/lib/memory-pass/config";
import useMobileInputFocus from "@/app/_components/useMobileInputFocus";
import { purchaseIapProduct } from "@/lib/iap/client";
import { CONVERSATION_TENSION_OPTIONS, normalizeConversationTension } from "@/lib/persona/conversationTension";

const STORAGE_KEY = "bogopa_profile_step4";
const STEP3_KEY = "bogopa_profile_step3";
const FREQUENT_PHRASE_EXAMPLES = [
  "예: 밥은 먹었어?",
  "예: 오늘 어땠어?",
  "예: 너무 무리하지 마",
  "예: 내가 네 편이야",
  "예: 잠은 잘 잤어?",
  "예: 따뜻한 거 챙겨 먹자",
  "예: 지금도 잘하고 있어",
  "예: 괜찮아, 하나씩 하자",
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
  "예: 언제든 말해줘",
  "예: 곁에 있을게",
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
  politeness: [...CONVERSATION_TENSION_OPTIONS],
  replyTempo: ["급한 성격", "적당히 차분한 성격", "신중하고 느린 편"],
  empathyStyle: ["감성 공감 우선", "차분한 이성적 위로", "해결책 중심의 조언"],
};

type Step3Raw = {
  personaName?: string;
  userNickname?: string;
  relationship?: string;
  personaImageKey?: string;
  personaImageSource?: "default" | "upload";
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

type UpgradeCtaState = {
  title: string;
  description: string;
  ctaLabel: string;
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
  politeness: "",
  replyTempo: "",
  empathyStyle: "",
  memories: [],
};
const MIN_SUBMIT_LOADING_MS = 4000;
const LOADING_PROGRESS_MESSAGES = [
  "대화 스타일을 정리하고 있습니다.",
  "자주 쓰는 문구를 반영하고 있습니다.",
  "핵심 기억을 자연스럽게 연결하고 있습니다.",
  "바로 대화할 수 있게 마무리하고 있습니다.",
];

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

function Dropdown({
  id,
  activeDropdown,
  onToggle,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  activeDropdown: string | null;
  onToggle: (next: string | null) => void;
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const open = activeDropdown === id;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!open) return;
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) onToggle(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onToggle]);

  const displayValue = value || "선택";
  const isSelected = value.trim().length > 0;

  return (
    <div className="relative" ref={ref}>
      <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.16em] text-[#5d605a]">{label}</label>
      <button
        type="button"
        onClick={() => onToggle(open ? null : id)}
        className="flex w-full items-center justify-between rounded-xl border border-[#afb3ac]/45 bg-[#f4f4ef] px-4 py-3 text-sm font-bold text-[#2f342e] transition-colors hover:bg-[#eceee8]"
      >
        <span className={isSelected ? "text-[#2f342e]" : "text-[#7f867f]"}>{displayValue}</span>
        <svg className={`h-4 w-4 text-[#787c75] transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-[#afb3ac]/35 bg-white shadow-xl">
          {options.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => {
                onChange(option);
                onToggle(null);
              }}
              className={`block w-full px-4 py-3 text-left text-sm font-bold transition-colors ${
                value.trim().length > 0 && option === value ? "bg-[#d7e9f2] text-[#3e5560]" : "text-[#2f342e] hover:bg-[#f4f8fa]"
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
  const [rowLocked, setRowLocked] = useState<boolean[]>([]);

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

  useEffect(() => {
    setRowLocked((prev) => {
      if (values.length === prev.length) return prev;
      if (values.length < prev.length) return prev.slice(0, values.length);

      // Existing non-empty loaded rows start as completed(deletable),
      // while newly appended empty rows start editable.
      const appended = Array.from({ length: values.length - prev.length }, (_, index) => {
        const value = values[prev.length + index] || "";
        return value.trim().length > 0;
      });
      return [...prev, ...appended];
    });
  }, [values, values.length]);

  return (
    <div className="space-y-3">
      <label className="block text-xs font-extrabold uppercase tracking-[0.16em] text-[#5d605a]">{label}</label>
      {values.map((item, index) => (
        <div key={`${label}-${index}`} className="flex gap-2">
          <input
            type="text"
            name={`list_${label}_${index}`}
            value={item}
            placeholder={rowPlaceholders[index] || placeholderExamples[0] || ""}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value.slice(0, maxChars);
              onChange(next);
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
            className="flex-1 rounded-xl border border-[#afb3ac]/45 bg-[#f4f4ef] px-4 py-3 text-sm font-semibold text-[#2f342e] outline-none ring-0 placeholder:text-[#7f867f]"
          />
          <button
            type="button"
            onClick={() => {
              if (rowLocked[index]) {
                onChange(values.filter((_, i) => i !== index));
                setRowPlaceholders((prev) => prev.filter((_, i) => i !== index));
                setRowLocked((prev) => prev.filter((_, i) => i !== index));
                return;
              }

              if (!values[index]?.trim()) return;
              setRowLocked((prev) => {
                const next = [...prev];
                next[index] = true;
                return next;
              });
            }}
            className={`rounded-xl px-3 text-sm font-bold transition-colors ${
              rowLocked[index]
                ? "text-[#ff5c5c] hover:bg-[#ff5c5c]/20 hover:text-[#ff8a8a]"
                : "text-[#4a626d] hover:bg-[#cde6f4]/30 hover:text-[#3e5560]"
            }`}
          >
            {rowLocked[index] ? "삭제" : "완료"}
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
        className="w-full rounded-2xl border border-dashed border-[#4a626d]/40 py-3.5 text-sm font-extrabold text-[#4a626d] hover:border-[#3e5560] hover:text-[#3e5560]"
      >
        + 항목 추가
      </button>
      <p className="text-xs text-[#5d605a]">최대 {maxItems}개 · 항목당 최대 {maxChars}자</p>
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
  const [isNativeAppRuntime, setIsNativeAppRuntime] = useState(false);
  const isInputFocused = useMobileInputFocus();
  const keyboardInsetExpr = isNativeAppRuntime
    ? "max(var(--bogopa-keyboard-height, 0px), 320px)"
    : "var(--bogopa-keyboard-height, 0px)";
  const mobileFocusedMainStyle = isInputFocused
    ? ({
        paddingBottom:
          `calc(${keyboardInsetExpr} + env(safe-area-inset-bottom) + 7.5rem)`,
        scrollPaddingBottom:
          `calc(${keyboardInsetExpr} + env(safe-area-inset-bottom) + 7.5rem)`,
      } as const)
    : undefined;
  const mobileFooterStyle = isNativeAppRuntime
    ? ({ bottom: "var(--bogopa-keyboard-height, 0px)" } as const)
    : undefined;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);
  const [relationLabel, setRelationLabel] = useState("");
  const [step3Nickname, setStep3Nickname] = useState("너");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [avatarSource, setAvatarSource] = useState<"default" | "upload" | null>(null);
  const [overrides, setOverrides] = useState<Step4Overrides>(DEFAULT_OVERRIDES);
  const [planLimits, setPlanLimits] = useState<PlanLimits>(FREE_PLAN_LIMITS);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [profileMeta, setProfileMeta] = useState<{ age: number | null; mbti: string; interests: string[] }>({
    age: null,
    mbti: "",
    interests: [],
  });
  const [upgradeCta, setUpgradeCta] = useState<UpgradeCtaState | null>(null);
  const [isPassSheetOpen, setIsPassSheetOpen] = useState(false);
  const [isPassPurchasing, setIsPassPurchasing] = useState(false);
  const [passSheetNotice, setPassSheetNotice] = useState<string | null>(null);
  const [loadingProgressIndex, setLoadingProgressIndex] = useState(0);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isStepReady, setIsStepReady] = useState(false);
  const areStyleFieldsSelected =
    overrides.politeness.trim().length > 0 &&
    overrides.replyTempo.trim().length > 0 &&
    overrides.empathyStyle.trim().length > 0;
  const isAnyDropdownOpen = activeDropdown !== null;
  const isStepThreeSubmitDisabled =
    !isStepReady ||
    isSubmitting ||
    relationLabel.trim().length === 0 ||
    step3Nickname.trim().length === 0 ||
    !areStyleFieldsSelected;

  useEffect(() => {
    setIsNativeAppRuntime(document.documentElement.classList.contains("native-app"));
  }, []);

  function buildStep3DraftPayload(source: Step4Overrides) {
    return {
      pastedConversation: "",
      uploadedFileName: null,
      useManualSettings: true,
      frequentPhrases: source.frequentPhrases.join("\n"),
      nickname: step3Nickname,
      toneStyle: "",
      emotionDepth: "",
      emojiStyle: "상황에 맞게 적당히",
      mode: "manual_only",
      overrides: source,
      step: 3,
      updatedAt: new Date().toISOString(),
    };
  }

  function handleFormKeyDownCapture(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    const target = event.target as EventTarget | null;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLButtonElement) return;
    event.preventDefault();
  }

  function saveStep3DraftForReturn() {
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

    const payload = buildStep3DraftPayload(normalized);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore local storage errors
    }

    void persistOnboardingStep(3, payload).catch((persistError) => {
      console.warn("[step-3] remote save failed, continue local flow", persistError);
    });
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setIsStepReady(false);

    const step3 = safeParse<Step3Raw>(window.localStorage.getItem(STEP3_KEY));
    const step4 = safeParse<Step4Raw>(window.localStorage.getItem(STORAGE_KEY));
    if (!step3) {
      router.replace("/step-1");
      return;
    }

    setRelationLabel(step3.relationship?.trim() || "");
    setStep3Nickname(step3.userNickname?.trim() || "너");
    setAvatarUrl(step3.personaImageUrl?.trim() || null);
    setAvatarKey(step3.personaImageKey?.trim() || null);
    setAvatarSource(step3.personaImageSource || null);

    const fromOverrides = step4?.overrides || {};

    const frequentPhrases =
      fromOverrides.frequentPhrases && fromOverrides.frequentPhrases.length > 0
        ? fromOverrides.frequentPhrases
        : splitTextList(step4?.frequentPhrases);

    setOverrides({
      frequentPhrases,
      politeness: (fromOverrides.politeness || "").trim()
        ? normalizeConversationTension(fromOverrides.politeness || "")
        : "",
      replyTempo: (fromOverrides.replyTempo || "").trim(),
      empathyStyle: (fromOverrides.empathyStyle || "").trim(),
      memories: fromOverrides.memories || [],
    });
    setIsStepReady(true);

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

  useEffect(() => {
    if (!isSubmitting) {
      setLoadingProgressIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingProgressIndex((prev) => (prev + 1) % LOADING_PROGRESS_MESSAGES.length);
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [isSubmitting]);

  useEffect(() => {
    if (!isAnyDropdownOpen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isAnyDropdownOpen]);

  useEffect(() => {
    if (!isPassSheetOpen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isPassSheetOpen]);

  useEffect(() => {
    const hasDraftContent =
      overrides.frequentPhrases.some((item) => item.trim().length > 0) ||
      overrides.memories.some((item) => item.trim().length > 0) ||
      overrides.politeness !== DEFAULT_OVERRIDES.politeness ||
      overrides.replyTempo !== DEFAULT_OVERRIDES.replyTempo ||
      overrides.empathyStyle !== DEFAULT_OVERRIDES.empathyStyle;

    if (!hasDraftContent) return;

    const payload = buildStep3DraftPayload(overrides);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [overrides, step3Nickname]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    if (!areStyleFieldsSelected) {
      setError("대화 텐션, 성격, 공감 방식을 선택해주세요.");
      return;
    }

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

    const payload = buildStep3DraftPayload(normalized);

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
            avatarSource,
            avatarKey,
            runtime: personaJson,
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
            required?: number;
            balance?: number;
          };

          if (response.status === 403 && body.code === "PERSONA_LIMIT_REACHED") {
            await waitMinimumLoading();
            setUpgradeCta({
              title: "생성 가능한 기억 수를 초과했어요",
              description:
                "무료는 기억 1개까지 가능해요. 기억 패스를 등록하면 더 만들고, 말투와 기억을 더 길고 정확하게 반영해요.",
              ctaLabel: "기억 패스 등록하기",
            });
            setIsSubmitting(false);
            return;
          }

          if (response.status === 402 && body.code === "MEMORY_INSUFFICIENT") {
            await waitMinimumLoading();
            setUpgradeCta({
              title: "기억이 부족해요",
              description: `기억 생성에는 ${body.required ?? 20}기억이 필요해요. 현재 잔액: ${body.balance ?? 0}기억`,
              ctaLabel: "기억 충전하러 가기",
            });
            setIsSubmitting(false);
            return;
          }

          if (response.status === 402 || response.status === 403) {
            await waitMinimumLoading();
            setUpgradeCta({
              title: "이 기능은 업그레이드가 필요해요",
              description: "기억 패스를 등록하면 확장된 설정으로, 말투와 기억을 더 길고 정확하게 반영해요.",
              ctaLabel: "기억 패스 등록하기",
            });
            setIsSubmitting(false);
            return;
          }
          console.warn("[step-3] persona save failed, continue local flow", body.error || response.statusText);
        }
      } catch (dbError) {
        console.warn("[step-3] persona save failed, continue local flow", dbError);
      }

      await waitMinimumLoading();
      clearOnboardingDraft();
      router.push(`/chat?id=${personaJson.personaId}`);
    } catch (submitError) {
      await waitMinimumLoading();
      const message = submitError instanceof Error ? submitError.message : "분석 중 오류가 발생했습니다.";
      setError(message);
      setIsSubmitting(false);
    }
  }

  function goToPayment() {
    saveStep3DraftForReturn();
    setIsPassSheetOpen(false);
    setPassSheetNotice(null);
    setUpgradeCta(null);
    router.push(`/payment?returnTo=${encodeURIComponent("/step-3")}`);
  }

  function openPassSheet() {
    setUpgradeCta(null);
    setPassSheetNotice(null);
    setIsPassSheetOpen(true);
  }

  async function subscribeMemoryPassNow() {
    if (isPassPurchasing) return;

    setPassSheetNotice(null);
    setIsPassPurchasing(true);

    try {
      const applied = await purchaseIapProduct("memory_pass_monthly");

      if (typeof applied.memoryBalance !== "number") {
        const memoryPassResponse = await fetch("/api/memory-pass", { cache: "no-store" });
        if (!memoryPassResponse.ok) {
          throw new Error("구독 반영 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
      }

      const memoryPassResponse = await fetch("/api/memory-pass", { cache: "no-store" });
      if (memoryPassResponse.ok) {
        const payload = (await memoryPassResponse.json()) as { isSubscribed?: boolean; limits?: PlanLimits };
        if (payload?.limits) setPlanLimits(payload.limits);
        setIsSubscribed(Boolean(payload?.isSubscribed));
      }

      setUpgradeCta(null);
      setIsPassSheetOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "구독을 진행하지 못했습니다.";
      setPassSheetNotice(message);
    } finally {
      setIsPassPurchasing(false);
    }
  }

  function openFrequentPhraseLimitCta() {
    setUpgradeCta({
      title: "자주 쓰는 문구는 1개까지 가능해요",
      description:
        "기억 패스를 등록하면 저장 개수와 입력 한도가 넓어지고, 말투와 기억을 더 길고 정확하게 반영해요.",
      ctaLabel: "기억 패스 등록하기",
    });
  }

  function openMemoryLimitCta() {
    setUpgradeCta({
      title: "핵심 기억은 1개까지 가능해요",
      description:
        "기억 패스를 등록하면 저장 개수와 입력 한도가 넓어지고, 말투와 기억을 더 길고 정확하게 반영해요.",
      ctaLabel: "기억 패스 등록하기",
    });
  }

  if (isSubmitting) {
    return (
      <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
        <main className="flex flex-1 items-center justify-center px-6">
          <div className="flex flex-col items-center text-center">
            <h1 className="break-keep font-headline text-4xl font-bold tracking-tight text-[#2f342e] md:text-5xl">
              내 기억 생성중
            </h1>
            <p className="mt-3 break-keep text-sm font-medium text-[#655d5a]">
              {LOADING_PROGRESS_MESSAGES[loadingProgressIndex]}
            </p>
            <div className="relative mt-8 h-20 w-20">
              <svg
                viewBox="0 0 80 80"
                className="absolute inset-0 h-full w-full animate-spin"
                aria-hidden="true"
              >
                <circle cx="40" cy="40" r="34" fill="none" stroke="#d6ddd8" strokeWidth="4" />
                <path
                  d="M40 6 A34 34 0 0 1 74 40"
                  fill="none"
                  stroke="#4a626d"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d="M74 40 A34 34 0 0 1 64 64"
                  fill="none"
                  stroke="#7fa4b6"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4a626d]" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] overflow-hidden flex-col bg-[#faf9f5] text-[#2f342e]">
      <header className="fixed inset-x-0 top-0 z-50 w-full bg-[#faf9f5] pt-[var(--native-safe-top)]">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-center px-6 md:px-12">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#655d5a]">Step 4/4</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#d6ddd8]">
              <div className="h-full w-full bg-[#4a626d] transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      <main
        className={`flex min-h-0 flex-1 items-start justify-center overscroll-y-contain px-4 pb-36 pt-[calc(5rem+var(--native-safe-top))] [-webkit-overflow-scrolling:touch] md:items-center md:px-6 md:pb-12 md:pt-24 ${
          isAnyDropdownOpen ? "overflow-y-hidden" : "overflow-y-auto"
        }`}
        style={mobileFocusedMainStyle}
      >
        <div className="relative w-full max-w-xl overflow-visible rounded-none bg-transparent p-0 shadow-none md:overflow-hidden md:rounded-[2rem] md:bg-white md:p-12 md:shadow-none md:border md:border-[#afb3ac]/20">
          <div className="absolute -right-10 -top-10 -z-0 hidden h-40 w-40 bg-[#cde6f4]/20 [border-radius:40%_60%_70%_30%/40%_50%_60%_50%] md:block" />

          <div className="relative z-10">
            <div className="mb-8 text-center md:text-left">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-[#2f342e] md:text-4xl">
              기억을 마지막으로 다듬어요
              </h1>
            </div>

            <form
              id="step-three-form"
              className="space-y-6"
              onSubmit={handleSubmit}
              onKeyDownCapture={handleFormKeyDownCapture}
              autoComplete="off"
            >
              <section className="pb-6 border-b border-[#5d605a]/55">
                <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">대화 스타일</h2>
                <div className="grid grid-cols-1 gap-4">
                  <Dropdown
                    id="politeness"
                    activeDropdown={activeDropdown}
                    onToggle={setActiveDropdown}
                    label="대화 텐션"
                    options={DROPDOWN_OPTIONS.politeness}
                    value={overrides.politeness}
                    onChange={(value) => {
                      setOverrides((prev) => ({ ...prev, politeness: value }));
                      if (error) setError("");
                    }}
                  />
                  <Dropdown
                    id="reply-tempo"
                    activeDropdown={activeDropdown}
                    onToggle={setActiveDropdown}
                    label="성격"
                    options={DROPDOWN_OPTIONS.replyTempo}
                    value={overrides.replyTempo}
                    onChange={(value) => {
                      setOverrides((prev) => ({ ...prev, replyTempo: value }));
                      if (error) setError("");
                    }}
                  />
                  <Dropdown
                    id="empathy-style"
                    activeDropdown={activeDropdown}
                    onToggle={setActiveDropdown}
                    label="공감 방식"
                    options={DROPDOWN_OPTIONS.empathyStyle}
                    value={overrides.empathyStyle}
                    onChange={(value) => {
                      setOverrides((prev) => ({ ...prev, empathyStyle: value }));
                      if (error) setError("");
                    }}
                  />
                </div>
              </section>

              <section className="pb-6 border-b border-[#5d605a]/55">
                <ListEditor
                  label="자주 쓰는 문구"
                  values={overrides.frequentPhrases}
                  placeholderExamples={FREQUENT_PHRASE_EXAMPLES}
                  onChange={(values) => setOverrides((prev) => ({ ...prev, frequentPhrases: values }))}
                  maxItems={planLimits.phraseItemMaxCount}
                  maxChars={planLimits.phraseItemCharMax}
                  onLimitReached={isSubscribed ? undefined : openFrequentPhraseLimitCta}
                />
              </section>

              <section className="pb-6 border-b border-[#5d605a]/55">
                <ListEditor
                  label="핵심 기억"
                  values={overrides.memories}
                  placeholderExamples={MEMORY_PLACEHOLDER_EXAMPLES}
                  onChange={(values) => setOverrides((prev) => ({ ...prev, memories: values }))}
                  maxItems={planLimits.memoryItemMaxCount}
                  maxChars={planLimits.memoryItemCharMax}
                  onLimitReached={isSubscribed ? undefined : openMemoryLimitCta}
                />
              </section>

              {!isSubscribed ? (
                <button
                  type="button"
                  onClick={openPassSheet}
                  className="w-full rounded-2xl border border-[#4a626d]/35 bg-[#f4f4ef] px-4 py-3 text-sm font-bold text-[#4a626d] hover:bg-[#eceee8]"
                >
                  기억 패스 등록하고 제한 해제하기
                </button>
              ) : null}

              <div className="pt-0 md:pt-2">
                <div className="hidden md:grid md:grid-cols-2 md:gap-4">
                  <Link
                    href="/step-2?entry=step4"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4ef] px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98] md:rounded-2xl md:text-lg md:font-bold md:shadow-none"
                  >
                    <ArrowLeftIcon />
                    이전
                  </Link>

                  <button
                    type="submit"
                    disabled={isStepThreeSubmitDisabled}
                    className="group flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:rounded-2xl md:text-lg md:font-bold md:shadow-lg"
                  >
                    <>
                      채팅 시작
                      <span className="transition-transform group-hover:translate-x-1">
                        <ArrowRightIcon />
                      </span>
                    </>
                  </button>
                </div>
                {error ? <p className="mt-3 text-center text-sm text-[#9f403d]">{error}</p> : null}
              </div>
            </form>
          </div>
        </div>
      </main>
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] bg-[#303733]/96 px-6 pb-[calc(1.28rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden"
        style={mobileFooterStyle}
      >
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/step-2?entry=step4"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4ef] px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98]"
          >
            <ArrowLeftIcon />
            이전
          </Link>

          <button
            type="submit"
            form="step-three-form"
            disabled={isStepThreeSubmitDisabled}
            className="group flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <>
              채팅 시작
              <span className="transition-transform group-hover:translate-x-1">
                <ArrowRightIcon />
              </span>
            </>
          </button>
        </div>
      </div>
      <HomeConfirmModal isOpen={isHomeModalOpen} onClose={() => setIsHomeModalOpen(false)} />
      {upgradeCta ? (
        <div className="fixed inset-0 z-[170] grid place-items-center bg-black/45 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-3xl border border-[#afb3ac]/20 bg-white p-6 text-center shadow-2xl shadow-black/20">
            <h3 className="break-keep font-headline text-2xl font-bold text-[#2f342e]">{upgradeCta.title}</h3>
            <p className="mt-3 break-keep text-sm leading-relaxed text-[#5d605a]">{upgradeCta.description}</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUpgradeCta(null)}
                className="rounded-2xl border border-[#afb3ac]/35 bg-[#f4f4ef] px-4 py-3 text-sm font-bold text-[#4a626d] hover:bg-[#eceee8]"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => {
                  if (upgradeCta.ctaLabel.includes("기억 패스")) {
                    openPassSheet();
                    return;
                  }
                  goToPayment();
                }}
                className="whitespace-nowrap rounded-2xl bg-[#4a626d] px-4 py-3 text-[13px] font-bold text-[#f0f9ff] hover:bg-[#3e5661]"
              >
                {upgradeCta.ctaLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isPassSheetOpen ? (
        <div className="fixed inset-0 z-[180] flex items-end bg-black/45 backdrop-blur-[1px]">
          <button
            type="button"
            aria-label="기억 패스 안내 닫기"
            className="absolute inset-0"
            onClick={() => {
              setPassSheetNotice(null);
              setIsPassSheetOpen(false);
            }}
          />
          <div className="relative w-full rounded-t-[1.8rem] bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 shadow-[0_-16px_40px_rgba(0,0,0,0.22)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d6ddd8]" />
            <h3 className="text-center font-headline text-2xl font-bold tracking-tight text-[#2f342e]">기억 패스</h3>
            <p className="mt-2 text-center text-sm font-medium text-[#5d605a]">제한을 해제하고 더 깊은 대화를 시작해보세요.</p>

            <ul className="mt-5 space-y-2 rounded-2xl border border-[#d7e3ea] bg-[#f5f9fc] px-4 py-4 text-sm text-[#3e5560]">
              <li>• 생성 가능한 기억 최대 15개</li>
              <li>• 매달 1,000 기억 자동 지급</li>
              <li>• 하루 최대 10개의 편지 무료 받기</li>
              <li>• 기억 조각 입력 한도 10배 확장</li>
              <li>• 입버릇 입력 한도 10배 확장</li>
              <li>• 대화 핵심 성향(서술형) 작성 가능</li>
            </ul>

            <div className="mt-5 rounded-2xl bg-[#304b5a] px-4 py-3 text-center text-[#f8fbff]">
              <p className="text-xs font-semibold text-[#f8fbff]/90">첫 달 특가</p>
              <div className="mt-1 flex items-end justify-center gap-2">
                <span className="text-sm font-semibold text-[#f8fbff]/65 line-through">6,600원</span>
                <span className="font-headline text-3xl font-extrabold text-[#f8fbff]">3,300원</span>
              </div>
              <p className="mt-0.5 text-[11px] text-[#f8fbff]/85">첫 달 이후 정상가 적용</p>
            </div>

            {passSheetNotice ? (
              <p className="mt-3 rounded-xl bg-[#f3f6f8] px-3 py-2 text-center text-xs font-semibold text-[#3e5560]">{passSheetNotice}</p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPassSheetNotice(null);
                  setIsPassSheetOpen(false);
                }}
                className="rounded-2xl border border-[#afb3ac]/35 bg-[#f4f4ef] px-4 py-3 text-sm font-bold text-[#4a626d] hover:bg-[#eceee8]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void subscribeMemoryPassNow()}
                disabled={isPassPurchasing}
                className="rounded-2xl bg-[#4a626d] px-4 py-3 text-sm font-bold text-[#f0f9ff] hover:bg-[#3e5661] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPassPurchasing ? "구매 처리중..." : "구독하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
