"use client";

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import { persistOnboardingStep } from "@/lib/onboarding-client";
import HomeConfirmModal from "@/app/_components/HomeConfirmModal";
import SignupCompleteModal from "@/app/_components/SignupCompleteModal";
import useMobileInputFocus from "@/app/_components/useMobileInputFocus";

type GoalValue = "comfort" | "memory" | "unfinished" | "daily" | "custom";

type StepTwoData = {
  goal: GoalValue;
  step: number;
  updatedAt: string;
};

const STORAGE_KEY = "bogopa_profile_step2";
const FORCE_STEP2_RELATIONSHIP_VIEW_KEY = "bogopa_force_step2_relationship_view";
const REQUIRED_ERROR_TEXT_CLASS = "ml-1 text-sm";
const REQUIRED_ERROR_TEXT_STYLE = { color: "#8b1f1f" } as const;

const GOALS: Array<{ value: GoalValue; label: string; icon: string }> = [
  { value: "comfort", label: "위로받고 싶어요", icon: "sentiment_satisfied" },
  { value: "memory", label: "추억을 떠올리고 싶어요", icon: "auto_stories" },
  { value: "unfinished", label: "못다 한 말을 해보고 싶어요", icon: "mail" },
  { value: "daily", label: "평소처럼 대화하고 싶어요", icon: "chat" },
  { value: "custom", label: "아무 말이나 편하게 나누고 싶어요", icon: "forum" },
];

function GoalIcon({ name, active }: { name: string; active: boolean }) {
  return (
    <span
      className="material-symbols-outlined text-[22px] leading-none"
      style={{
        color: active ? "#f0f9ff" : "#4a626d",
        fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      }}
      aria-hidden="true"
    >
      {name}
    </span>
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

export default function StepOnePage() {
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
  const goalSectionRef = useRef<HTMLDivElement | null>(null);
  const [goal, setGoal] = useState<GoalValue | null>(null);
  const [isGoalAttention, setIsGoalAttention] = useState(false);
  const [goalError, setGoalError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);

  function triggerAttention(element: HTMLElement | null, setAttention: (next: boolean) => void, focus?: () => void) {
    setAttention(true);
    element?.scrollIntoView({ behavior: "auto", block: "center" });
    element?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(6px)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 320, easing: "ease-out" },
    );
    if (focus) {
      requestAnimationFrame(() => focus());
    }
    window.setTimeout(() => setAttention(false), 700);
  }

  function handleFormKeyDownCapture(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    const target = event.target as EventTarget | null;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLButtonElement) return;
    event.preventDefault();
  }

  useEffect(() => {
    setIsNativeAppRuntime(document.documentElement.classList.contains("native-app"));
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as Partial<StepTwoData>;
      if (saved.goal && GOALS.some((item) => item.value === saved.goal)) {
        setGoal(saved.goal);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (!goal) return;
    const payload: StepTwoData = {
      goal,
      step: 1,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [goal]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextGoalError = goal ? "" : "대화 목표를 선택해주세요.";
    setGoalError(nextGoalError);

    if (nextGoalError) {
      triggerAttention(goalSectionRef.current, setIsGoalAttention);
      return;
    }

    if (!goal) {
      return;
    }

    setIsSubmitting(true);
    setSaveError("");

    const payload: StepTwoData = {
      goal,
      step: 1,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    void persistOnboardingStep(1, payload, { forceNewSession: true }).catch((error) => {
      console.error("[step-1] remote save failed, continue local flow", error);
    });
    window.localStorage.setItem(FORCE_STEP2_RELATIONSHIP_VIEW_KEY, "1");
    router.push(`/step-2?entry=step1&t=${Date.now()}`);
  }

  return (
    <div className="relative flex h-[100dvh] overflow-hidden flex-col bg-[#faf9f5] text-[#2f342e]">
      <header className="fixed inset-x-0 top-0 z-50 w-full bg-[#faf9f5] pt-[var(--native-safe-top)] [transform:translateZ(0)]">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-center px-6 md:px-12">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#655d5a]">Step 1/4</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#d6ddd8]">
              <div className="h-full w-1/4 bg-[#4a626d] transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      <main
        className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto overscroll-y-contain px-4 pb-36 pt-[calc(5rem+var(--native-safe-top))] [-webkit-overflow-scrolling:touch] md:items-center md:px-6 md:pb-12 md:pt-24"
        style={mobileFocusedMainStyle}
      >
        <div className="relative w-full max-w-xl overflow-visible rounded-none bg-transparent p-0 shadow-none md:overflow-hidden md:rounded-[2rem] md:bg-[#303733] md:p-12 md:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
          <div className="absolute -right-10 -top-10 -z-0 hidden h-40 w-40 bg-[#cde6f4]/20 [border-radius:40%_60%_70%_30%/40%_50%_60%_50%] md:block" />

          <div className="relative z-10">
            <div className="mb-8 text-center md:text-left">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-[#f0f5f2] md:text-4xl">
                이 대화를 통해
                <br />
                무엇을 바라고 있나요?
              </h1>
            </div>

            <form
              id="step-one-form"
              className="space-y-8"
              onSubmit={handleSubmit}
              onKeyDownCapture={handleFormKeyDownCapture}
              autoComplete="off"
            >
              <div
                ref={goalSectionRef}
                className={`grid grid-cols-1 gap-4 rounded-2xl transition-colors ${
                  isGoalAttention ? "bg-[#3f2f2f]/15 outline outline-2 outline-[#ff7b7b]" : ""
                }`}
              >
                {GOALS.map((item) => {
                  const isActive = goal === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setGoal(item.value);
                        setIsGoalAttention(false);
                        setGoalError("");
                      }}
                      className={`group relative rounded-2xl border p-4 text-left transition-all duration-300 hover:-translate-y-0.5 ${isActive
                        ? "border-[#4a626d] bg-[#4a626d]"
                        : "border-transparent bg-[#f4f4ef] hover:bg-[#ffffff]"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid h-8 w-8 place-items-center rounded-full transition-all ${isActive
                            ? "bg-white/15 text-[#f0f9ff]"
                            : "bg-[#e6e9e2] text-[#4a626d] opacity-90 group-hover:opacity-100"
                            }`}
                        >
                          <GoalIcon name={item.icon} active={isActive} />
                        </span>
                        <p className={`text-base font-semibold md:text-lg ${isActive ? "text-[#f0f9ff]" : "text-[#2f342e]"}`}>{item.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {goalError ? <p className={REQUIRED_ERROR_TEXT_CLASS} style={REQUIRED_ERROR_TEXT_STYLE}>{goalError}</p> : null}

              <div className="pt-0 md:pt-2">
                <div className="hidden md:grid md:grid-cols-2 md:gap-4">
                  <button
                    type="button"
                    onClick={() => setIsHomeModalOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4ef] px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98] md:rounded-2xl md:text-lg md:font-bold md:shadow-none"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group w-full flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:rounded-2xl md:text-lg md:font-bold md:shadow-lg"
                  >
                    {isSubmitting ? (
                      <>
                        <SpinnerIcon />
                        저장 중...
                      </>
                    ) : (
                      <>
                        다음으로
                        <span className="transition-transform group-hover:translate-x-1">
                          <ArrowRightIcon />
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {saveError ? <p className="mt-3 text-center text-sm" style={REQUIRED_ERROR_TEXT_STYLE}>{saveError}</p> : null}
              </div>
            </form>
          </div>
        </div>
      </main>
      {!isInputFocused ? (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-[#303733]/96 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsHomeModalOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4ef] px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98]"
            >
              취소
            </button>
            <button
              type="submit"
              form="step-one-form"
              disabled={isSubmitting}
              className="group w-full flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon />
                  저장 중...
                </>
              ) : (
                <>
                  다음으로
                  <span className="transition-transform group-hover:translate-x-1">
                    <ArrowRightIcon />
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
      <HomeConfirmModal 
        isOpen={isHomeModalOpen} 
        onClose={() => setIsHomeModalOpen(false)} 
      />
      <SignupCompleteModal />
    </div>
  );
}
