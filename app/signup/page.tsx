"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { INTEREST_OPTIONS, InterestKey, MAX_INTEREST_SELECTION } from "@/lib/user-profile/options";
import { SIGNUP_COMPLETE_MODAL_PENDING_KEY, SIGNUP_COMPLETED_AT_KEY } from "@/lib/onboarding-flags";
import {
  AI_DATA_TRANSFER_CONSENT_VERSION,
  AI_DATA_TRANSFER_PROVIDER_NAME,
} from "@/lib/ai-consent";

type Gender = "male" | "female" | "other";

type UserProfileResponse = {
  userId: string;
  name: string;
  birthDate: string | null;
  gender: Gender | null;
  mbti: string | null;
  interests: string[];
  aiDataTransferConsented?: boolean;
  aiDataTransferConsentedAt?: string | null;
  aiDataTransferConsentVersion?: string | null;
  profileCompleted: boolean;
};

type SignupDraft = {
  step?: 1 | 2;
  name?: string;
  birthDate?: string;
  gender?: Gender | null;
  mbtiParts?: [string, string, string, string];
  interests?: string[];
  aiDataTransferConsentAgreed?: boolean;
};

const MBTI_GROUPS = [
  ["E", "I"],
  ["N", "S"],
  ["T", "F"],
  ["P", "J"],
] as const;
const SIGNUP_DRAFT_STORAGE_KEY = "bogopa_signup_draft_v1";
const SIGNUP_HIDDEN_INTEREST_KEYS = new Set<InterestKey>(["friend", "relationship", "family"]);
const SIGNUP_INTEREST_OPTIONS = INTEREST_OPTIONS.filter((option) => !SIGNUP_HIDDEN_INTEREST_KEYS.has(option.key));
const SIGNUP_INTEREST_LABEL_SET = new Set<string>(SIGNUP_INTEREST_OPTIONS.map((option) => option.label));

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
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

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 19.4a6.6 6.6 0 0 1 13 0" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M4 9.5h16" />
    </svg>
  );
}

function MaleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="15" r="5" />
      <path d="M13.5 10.5 19 5" />
      <path d="M15 5h4v4" />
    </svg>
  );
}

function FemaleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="9" r="4.8" />
      <path d="M12 14v6" />
      <path d="M9 18h6" />
    </svg>
  );
}

function OtherGenderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M7 19a5 5 0 0 1 10 0" />
      <path d="M18.5 5.5h3M20 4v3" />
    </svg>
  );
}

function TopicIcon({ topic }: { topic: InterestKey }) {
  const baseClass = "h-[18px] w-[18px]";
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (topic) {
    case "daily":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
        </svg>
      );
    case "emotion_comfort":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z" />
          <path d="M9.4 12.4c.5.8 1.3 1.2 2.1 1.2s1.7-.4 2.4-1.2" />
        </svg>
      );
    case "relationship":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="8" r="3" />
          <path d="M3.5 19a4.5 4.5 0 0 1 9 0M11.5 19a4.5 4.5 0 0 1 9 0M9.5 12.5h5" />
        </svg>
      );
    case "romance":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M12 20s-6-4-6-9a3.5 3.5 0 0 1 6-2.2A3.5 3.5 0 0 1 18 11c0 5-6 9-6 9Z" />
          <path d="M19 4v3M17.5 5.5h3M8.5 6.5l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6.6-1.2Z" />
        </svg>
      );
    case "family":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "friend":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M6 14.5 9.2 17a2 2 0 0 0 2.5-.1L14 15l2.4 1.9a2 2 0 0 0 2.5.1L22 14.5" />
          <path d="M2 12.5h5l2 2 2-2h11" />
          <path d="M7 9h3M14 9h3" />
        </svg>
      );
    case "music":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
          <path d="M9 18V6l10-2v12" />
        </svg>
      );
    case "movie":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 9 4-4M9 9l4-4M15 9l4-4M7 19v-6M12 19v-6M17 19v-6" />
        </svg>
      );
    case "drama":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 9h10M7 12h10M7 15h6M9 3l3 2 3-2" />
        </svg>
      );
    case "hobby":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M7.5 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm5.5-5h.1a2.4 2.4 0 1 0 0-4.8h-.1a2.4 2.4 0 1 0 0 4.8Zm4.8 5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" />
          <path d="M4 14.2c0-5.6 4.5-10.2 10.1-10.2h1.6a4.3 4.3 0 0 1 0 8.6h-1.7a2.8 2.8 0 0 0-2.8 2.8c0 2.5-2.1 4.6-4.6 4.6A2.6 2.6 0 0 1 4 17.4v-3.2Z" />
        </svg>
      );
    case "travel":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="m2 12 20-8-6 9-1 7-3-5-5-3Z" />
        </svg>
      );
    case "study_career":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 3V5Z" />
          <path d="M18 8h2v11" />
        </svg>
      );
    case "work_career":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5h6v2M3 12h18" />
        </svg>
      );
    case "self_growth":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M12 20v-6" />
          <path d="M12 14c0-4.2 2.8-7 7-7 0 4.2-2.8 7-7 7Zm0 0c0-3.5-2.4-6-6-6 0 3.6 2.4 6 6 6Z" />
          <path d="M5 20h14" />
        </svg>
      );
    case "memory":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.7 1.8" />
        </svg>
      );
    case "counseling":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M20 14a4 4 0 0 1-4 4H9l-4 3v-3a4 4 0 0 1-1-2.7V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6Z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case "small_talk":
      return (
        <svg viewBox="0 0 24 24" className={baseClass} {...common}>
          <path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8H10l-4 4v-4A2.8 2.8 0 0 1 4 14.2V6.8Z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
      );
    default:
      return null;
  }
}

function isAtLeastAge(birthDate: string, minAge: number) {
  const [yearRaw, monthRaw, dayRaw] = birthDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;

  const today = new Date();
  let age = today.getFullYear() - year;
  const hasBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hasBirthdayThisYear) age -= 1;
  return age >= minAge;
}

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/step-1";

  const [isLoading, setIsLoading] = useState(true);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mbtiParts, setMbtiParts] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [interests, setInterests] = useState<string[]>([]);
  const [aiDataTransferConsentAgreed, setAiDataTransferConsentAgreed] = useState(false);
  const [error, setError] = useState("");
  const [interestLimitError, setInterestLimitError] = useState("");
  const [isAgeNoticeOpen, setIsAgeNoticeOpen] = useState(false);
  const ageNoticeTimeoutRef = useRef<number | null>(null);
  const mbti = useMemo(
    () => (mbtiParts.every((part) => part.length === 1) ? mbtiParts.join("") : ""),
    [mbtiParts],
  );

  const canNextStep = useMemo(() => {
    return name.trim().length > 0 && birthDate.length === 10 && Boolean(gender);
  }, [name, birthDate, gender]);

  const canSubmit = useMemo(() => {
    return mbti.length === 4 && interests.length > 0 && aiDataTransferConsentAgreed;
  }, [mbti, interests, aiDataTransferConsentAgreed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawDraft = window.localStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY);
      if (!rawDraft) return;
      const parsed = JSON.parse(rawDraft) as SignupDraft;

      if (parsed.step === 1 || parsed.step === 2) {
        setStep(parsed.step);
      }
      if (typeof parsed.name === "string") {
        setName(parsed.name);
      }
      if (typeof parsed.birthDate === "string") {
        setBirthDate(parsed.birthDate);
      }
      if (parsed.gender === "male" || parsed.gender === "female" || parsed.gender === "other") {
        setGender(parsed.gender);
      }
      if (
        Array.isArray(parsed.mbtiParts) &&
        parsed.mbtiParts.length === 4 &&
        parsed.mbtiParts.every((part) => typeof part === "string")
      ) {
        setMbtiParts([
          parsed.mbtiParts[0] || "",
          parsed.mbtiParts[1] || "",
          parsed.mbtiParts[2] || "",
          parsed.mbtiParts[3] || "",
        ]);
      }
      if (Array.isArray(parsed.interests)) {
        const dedupedInterests = Array.from(
          new Set(
            parsed.interests
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter((item) => item.length > 0 && SIGNUP_INTEREST_LABEL_SET.has(item)),
          ),
        ).slice(0, MAX_INTEREST_SELECTION);
        setInterests(dedupedInterests);
      }
      if (parsed.aiDataTransferConsentAgreed === true) {
        setAiDataTransferConsentAgreed(true);
      }
      setHasLocalDraft(true);
    } catch (error) {
      console.error("[signup] failed to parse local draft", error);
    } finally {
      setIsDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isDraftHydrated) return;
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/user/profile", { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 401) {
            router.replace("/");
          }
          return;
        }
        const payload = (await response.json()) as { ok?: boolean; profile?: UserProfileResponse };
        const profile = payload.profile;
        if (!profile || cancelled) return;
        if (profile.profileCompleted) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
          }
          router.replace(returnTo);
          return;
        }
        const mbtiValue = (profile.mbti || "").toUpperCase();
        const hasValidMbtiProfileValue =
          mbtiValue.length === 4 &&
          MBTI_GROUPS.every((group, index) => (group as readonly string[]).includes(mbtiValue[index] || ""));

        if (
          !hasLocalDraft &&
          hasValidMbtiProfileValue
        ) {
          setMbtiParts([
            mbtiValue[0] || "",
            mbtiValue[1] || "",
            mbtiValue[2] || "",
            mbtiValue[3] || "",
          ]);
        }
        const normalizedInterests = Array.isArray(profile.interests)
          ? profile.interests.flatMap((item) => {
              const value = typeof item === "string" ? item.trim() : "";
              if (!value) return [];
              if (value === "영화/드라마" || value === "movie_drama") return ["영화", "드라마"];
              return [value];
            })
          : [];
        const profileInterests = Array.from(new Set(normalizedInterests))
          .filter((item) => SIGNUP_INTEREST_LABEL_SET.has(item))
          .slice(0, MAX_INTEREST_SELECTION);

        if (hasLocalDraft) {
          setName((prev) => prev || profile.name || "");
          setBirthDate((prev) => prev || profile.birthDate || "");
          setGender((prev) => prev ?? profile.gender ?? null);
          if (hasValidMbtiProfileValue) {
            setMbtiParts((prev) =>
              prev.some((part) => part.length > 0)
                ? prev
                : [mbtiValue[0] || "", mbtiValue[1] || "", mbtiValue[2] || "", mbtiValue[3] || ""],
            );
          }
          setInterests((prev) => (prev.length > 0 ? prev : profileInterests));
          setAiDataTransferConsentAgreed((prev) => prev || profile.aiDataTransferConsented === true);
        } else {
          setName(profile.name || "");
          setBirthDate(profile.birthDate || "");
          setGender(profile.gender || null);
          setInterests(profileInterests);
          setAiDataTransferConsentAgreed(profile.aiDataTransferConsented === true);
        }
      } catch (loadError) {
        console.error("[signup] failed to load profile", loadError);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [hasLocalDraft, isDraftHydrated, returnTo, router]);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading) return;
    try {
      const draft: SignupDraft = {
        step,
        name,
        birthDate,
        gender,
        mbtiParts,
        interests,
        aiDataTransferConsentAgreed,
      };
      window.localStorage.setItem(SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error("[signup] failed to persist local draft", error);
    }
  }, [aiDataTransferConsentAgreed, birthDate, gender, interests, isLoading, mbtiParts, name, step]);

  useEffect(() => {
    return () => {
      if (ageNoticeTimeoutRef.current) {
        window.clearTimeout(ageNoticeTimeoutRef.current);
      }
    };
  }, []);

  function toggleInterest(label: string) {
    let isOverLimit = false;
    setInterests((prev) => {
      if (prev.includes(label)) return prev.filter((item) => item !== label);
      if (prev.length >= MAX_INTEREST_SELECTION) {
        isOverLimit = true;
        return prev;
      }
      return [...prev, label];
    });
    setInterestLimitError(isOverLimit ? `관심사 최대 ${MAX_INTEREST_SELECTION}개까지 선택할 수 있습니다.` : "");
  }

  function selectMbtiPart(groupIndex: number, letter: string) {
    setMbtiParts((prev) => {
      const next = [...prev] as [string, string, string, string];
      next[groupIndex] = letter;
      return next;
    });
  }

  function showUnderAgeNotice() {
    setIsAgeNoticeOpen(true);
    if (ageNoticeTimeoutRef.current) {
      window.clearTimeout(ageNoticeTimeoutRef.current);
    }
    ageNoticeTimeoutRef.current = window.setTimeout(() => {
      setIsAgeNoticeOpen(false);
    }, 1800);
  }

  function goNext() {
    if (!canNextStep) {
      setError("이름, 생년월일, 성별을 모두 입력해주세요.");
      return;
    }
    if (!isAtLeastAge(birthDate, 14)) {
      setError("");
      showUnderAgeNotice();
      return;
    }
    setError("");
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      goNext();
      return;
    }
    if (isSubmitting) return;
    if (!canSubmit || !gender) {
      setError("MBTI, 관심사, AI 데이터 전송 동의를 완료해주세요.");
      return;
    }
    if (!isAtLeastAge(birthDate, 14)) {
      setError("");
      showUnderAgeNotice();
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          birthDate,
          gender,
          mbti,
          interests,
          aiDataTransferConsentAgreed,
          aiDataTransferConsentVersion: AI_DATA_TRANSFER_CONSENT_VERSION,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "회원가입 정보를 저장하지 못했습니다.");
      }

      const onboardingStepOne = {
        name: name.trim(),
        gender: gender === "male" ? "Male" : gender === "female" ? "Female" : "Other",
        step: 1,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem("bogopa_profile_step1", JSON.stringify(onboardingStepOne));
      window.localStorage.setItem(SIGNUP_COMPLETED_AT_KEY, String(Date.now()));
      window.localStorage.setItem(SIGNUP_COMPLETE_MODAL_PENDING_KEY, "1");
      window.localStorage.removeItem(SIGNUP_DRAFT_STORAGE_KEY);

      const target = returnTo.startsWith("/step-") ? returnTo : "/step-1";
      setIsRouteTransitioning(true);
      window.setTimeout(() => {
        router.replace(target);
      }, 260);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "회원가입 처리 중 오류가 발생했습니다.");
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#faf9f5]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e] transition-opacity duration-300 ${
        isRouteTransitioning ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <header className="fixed top-0 z-50 w-full border-b border-[#afb3ac]/25 bg-[#faf9f5]/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:px-12">
          <div className="flex items-center gap-2">
            <img src="/logo/bogopa%20logo.png" alt="보고파" className="h-8 w-auto object-contain" />
            <span className="font-headline text-2xl font-bold tracking-tight text-[#4a626d]">Bogopa</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#655d5a]">회원가입 {step}/2</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#edeee8]">
              <div className={`h-full bg-[#4a626d] transition-all duration-500 ${step === 1 ? "w-1/2" : "w-full"}`} />
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] md:px-6 md:pb-[calc(8rem+env(safe-area-inset-bottom))] md:pt-24">
        <div className="relative w-full max-w-2xl overflow-visible rounded-none bg-transparent p-0 shadow-none md:overflow-hidden md:rounded-[2rem] md:bg-[#303733] md:p-12 md:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
          <div className="relative z-10">
            <div className="mb-8 text-center md:text-left">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-[#f0f5f2] md:text-4xl">
                {step === 1 ? "기본 정보를 알려주세요." : "나에 대해서 알려주세요"}
              </h1>
            </div>

            <form className="space-y-8" onSubmit={handleSubmit}>
              {step === 1 ? (
                <>
                  <div className="space-y-3">
                    <label className="ml-1 block text-sm font-semibold text-[#f0f5f2]" htmlFor="signupName">
                      이름
                    </label>
                    <div className="group relative">
                      <input
                        id="signupName"
                        name="signupName"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="이름을 입력하세요"
                        className="w-full rounded-xl border border-[#afb3ac]/45 bg-[#f4f4ef] px-6 py-4 pr-12 text-lg text-[#2f342e] placeholder:text-[#787c75] outline-none ring-0 transition-all duration-300 focus:ring-2 focus:ring-[#4a626d]/20"
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#787c75]">
                        <PersonIcon />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-[#5e6863]/40 bg-[#232825] px-4 py-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={aiDataTransferConsentAgreed}
                        onChange={(event) => setAiDataTransferConsentAgreed(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border border-[#7d9085] bg-[#f4f4ef] text-[#3e5560] accent-[#3e5560]"
                      />
                      <span className="text-sm leading-relaxed text-[#f0f5f2]">
                        (필수) 대화 기능 제공을 위해 입력한 메시지 및 대화 맥락 일부가{" "}
                        <span className="font-semibold">{AI_DATA_TRANSFER_PROVIDER_NAME}</span>로 전송되는 것에 동의합니다.
                        <br />
                        <Link href="/legal/privacy?back=%2Fsignup" className="font-semibold text-[#9ec0d1] underline underline-offset-2">
                          개인정보 처리방침에서 상세 보기
                        </Link>
                      </span>
                    </label>
                  </div>

                  <div className="space-y-3">
                    <label className="ml-1 block text-sm font-semibold text-[#f0f5f2]" htmlFor="signupBirthDate">
                      생년월일
                    </label>
                    <div className="group relative overflow-hidden rounded-xl border border-[#afb3ac]/45 bg-[#f4f4ef] transition-all duration-300 focus-within:ring-2 focus-within:ring-[#4a626d]/20">
                      <input
                        id="signupBirthDate"
                        name="signupBirthDate"
                        type="date"
                        value={birthDate}
                        onChange={(event) => setBirthDate(event.target.value)}
                        className="block w-full min-w-0 max-w-full bg-transparent pl-6 pr-14 py-4 text-lg text-[#2f342e] outline-none ring-0 appearance-none [-webkit-appearance:none] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#787c75]">
                        <CalendarIcon />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="ml-1 block text-sm font-semibold text-[#f0f5f2]">성별</label>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        type="button"
                        onClick={() => setGender("male")}
                        className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 px-4 py-6 transition duration-300 ${
                          gender === "male"
                            ? "border-[#24303a] bg-[#cce2f0] text-[#14191d] shadow-inner shadow-[#24303a]/30"
                            : "border-transparent bg-[#f4f4ef] text-[#655d5a] hover:bg-[#e6e9e2]"
                        }`}
                      >
                        <MaleIcon />
                        <span className="font-medium">남성</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGender("female")}
                        className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 px-4 py-6 transition-all duration-300 ${
                          gender === "female"
                            ? "border-[#4a626d] bg-[#d9e8f0] text-[#24303a]"
                            : "border-transparent bg-[#f4f4ef] text-[#655d5a] hover:bg-[#e6e9e2]"
                        }`}
                      >
                        <FemaleIcon />
                        <span className="font-medium">여성</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGender("other")}
                        className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 px-4 py-6 transition-all duration-300 ${
                          gender === "other"
                            ? "border-[#4a626d] bg-[#d9e8f0] text-[#24303a]"
                            : "border-transparent bg-[#f4f4ef] text-[#655d5a] hover:bg-[#e6e9e2]"
                        }`}
                      >
                        <OtherGenderIcon />
                        <span className="font-medium">기타</span>
                      </button>
                    </div>
                  </div>

                  <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-[60] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 space-y-2">
                    <button
                      type="button"
                      onClick={goNext}
                      className="group flex w-full items-center justify-center gap-2 rounded-full bg-[#4a626d] px-6 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] md:rounded-2xl md:px-0 md:py-5 md:text-lg md:font-bold md:shadow-lg"
                    >
                      다음
                      <span className="transition-transform group-hover:translate-x-1">
                        <ArrowRightIcon />
                      </span>
                    </button>
                    <p className="text-center text-[11px] leading-relaxed text-[#5d605a] md:hidden">
                      보고파의{" "}
                      <Link href="/legal/terms?back=%2Fsignup" className="font-semibold text-[#4a626d] underline underline-offset-2">
                        서비스 이용약관
                      </Link>
                      {" "}및{" "}
                      <Link href="/legal/privacy?back=%2Fsignup" className="font-semibold text-[#4a626d] underline underline-offset-2">
                        개인정보 처리방침
                      </Link>
                      에 동의하시면 계속 진행해주세요.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <label className="ml-1 block text-sm font-semibold text-[#f0f5f2]">MBTI</label>
                    <div className="grid grid-cols-4 gap-2">
                      {MBTI_GROUPS.map((group, groupIndex) => (
                        <div key={`mbti-group-${groupIndex}`} className="space-y-2">
                          {group.map((letter) => (
                            <button
                              key={letter}
                              type="button"
                              onClick={() => selectMbtiPart(groupIndex, letter)}
                              className={`w-full rounded-xl border px-2 py-3 text-base font-extrabold transition-all md:text-lg ${
                                mbtiParts[groupIndex] === letter
                                  ? "border-[#7fa4b6] bg-[#cde6f4] text-[#22303a]"
                                  : "border-white/10 bg-[#242926] text-[#f0f5f2] hover:bg-[#2d3430]"
                              }`}
                            >
                              {letter}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="ml-1 flex items-center justify-between">
                      <label className="block text-sm font-semibold text-[#f0f5f2]">관심사</label>
                      {interestLimitError ? (
                        <span className="text-xs font-semibold text-[#b23a32]">{interestLimitError}</span>
                      ) : (
                        <span className="text-xs font-semibold text-[#f0f5f2]/70">
                          {interests.length}/{MAX_INTEREST_SELECTION}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 xl:grid-cols-4 2xl:grid-cols-5">
                      {SIGNUP_INTEREST_OPTIONS.map((option) => {
                        const selected = interests.includes(option.label);
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => toggleInterest(option.label)}
                            className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-all ${
                              selected
                                ? "border-[#7fa4b6] bg-[#cde6f4] text-[#22303a]"
                                : "border-white/10 bg-[#242926] text-[#f0f5f2] hover:bg-[#2d3430]"
                            }`}
                          >
                            <TopicIcon topic={option.key} />
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-[60] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="flex items-center justify-center gap-1 rounded-full border border-[#4a626d] bg-white px-4 py-4 text-base font-semibold text-[#4a626d] md:rounded-2xl"
                      >
                        <ArrowLeftIcon />
                        이전
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || !canSubmit}
                        className="flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] transition-all duration-300 hover:bg-[#3e5661] disabled:cursor-not-allowed disabled:opacity-50 md:rounded-2xl"
                      >
                        {isSubmitting ? (
                          <>
                            <SpinnerIcon />
                            저장 중...
                          </>
                        ) : (
                          "가입 완료"
                        )}
                      </button>
                    </div>
                    <p className="text-center text-[11px] leading-relaxed text-[#5d605a] md:hidden">
                      보고파의{" "}
                      <Link href="/legal/terms?back=%2Fsignup" className="font-semibold text-[#4a626d] underline underline-offset-2">
                        서비스 이용약관
                      </Link>
                      {" "}및{" "}
                      <Link href="/legal/privacy?back=%2Fsignup" className="font-semibold text-[#4a626d] underline underline-offset-2">
                        개인정보 처리방침
                      </Link>
                      에 동의하시면 계속 진행해주세요.
                    </p>
                  </div>
                </>
              )}

              {error ? <p className="pt-1 text-center text-sm font-semibold text-[#b23a32]">{error}</p> : null}
            </form>
          </div>
        </div>
      </main>

      {isAgeNoticeOpen ? (
        <div className="pointer-events-none fixed inset-0 z-[120] grid place-items-center px-6">
          <div className="rounded-2xl border border-[#d8dee3] bg-white px-6 py-4 text-center text-sm font-bold text-[#24303a] shadow-[0_10px_28px_rgba(47,52,46,0.14)]">
            만 14세 이상만 사용가능합니다.
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#faf9f5]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
        </div>
      }
    >
      <SignupContent />
    </Suspense>
  );
}
