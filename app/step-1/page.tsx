"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import { persistOnboardingStep } from "@/lib/onboarding-client";
import HomeConfirmModal from "@/app/_components/HomeConfirmModal";
import SignupCompleteModal from "@/app/_components/SignupCompleteModal";

type GoalValue = "comfort" | "memory" | "unfinished" | "daily" | "custom";

type StepTwoData = {
  goal: GoalValue;
  customGoal?: string;
  step: number;
  updatedAt: string;
};

const STORAGE_KEY = "bogopa_profile_step2";

const GOALS: Array<{ value: GoalValue; label: string; icon: string; fullWidth?: boolean }> = [
  { value: "comfort", label: "위로받고 싶어요", icon: "favorite" },
  { value: "memory", label: "추억을 떠올리고 싶어요", icon: "collections_bookmark" },
  { value: "unfinished", label: "못다 한 말을 해보고 싶어요", icon: "auto_stories" },
  { value: "daily", label: "평소처럼 대화하고 싶어요", icon: "chat_bubble" },
  { value: "custom", label: "직접 입력", icon: "edit_note", fullWidth: true },
];

function GoalIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "#3e5560" : "#4a626d";

  if (name === "favorite") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
        <path d="M12 20s-6.8-4.2-8.6-8a5 5 0 0 1 8.6-5 5 5 0 0 1 8.6 5c-1.8 3.8-8.6 8-8.6 8Z" />
      </svg>
    );
  }

  if (name === "collections_bookmark") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
        <path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13L12 15.3 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
        <path d="M9 7.5h6" />
      </svg>
    );
  }

  if (name === "auto_stories") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
        <path d="M4.8 5.5h6.8a2 2 0 0 1 2 2V18a2 2 0 0 0-2-2H4.8V5.5Z" />
        <path d="M19.2 5.5h-6.8a2 2 0 0 0-2 2V18a2 2 0 0 1 2-2h6.8V5.5Z" />
      </svg>
    );
  }

  if (name === "chat_bubble") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
        <path d="M20 13.6A3.4 3.4 0 0 1 16.6 17H9.7L5 20v-3.4A3.4 3.4 0 0 1 3.6 14V7.4A3.4 3.4 0 0 1 7 4h9.6A3.4 3.4 0 0 1 20 7.4v6.2Z" />
        <path d="M8.4 9.3h7.2M8.4 12.5h4.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth="1.8">
      <path d="M4.5 19.5h4.1L19 9.1a1.7 1.7 0 0 0 0-2.4l-1.7-1.7a1.7 1.7 0 0 0-2.4 0L4.5 15.4v4.1Z" />
      <path d="m12.4 7.6 4 4" />
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

export default function StepOnePage() {
  const router = useRouter();
  const [goal, setGoal] = useState<GoalValue | null>(null);
  const [customGoal, setCustomGoal] = useState("");
  const [goalError, setGoalError] = useState("");
  const [customError, setCustomError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as Partial<StepTwoData>;
      if (saved.goal && GOALS.some((item) => item.value === saved.goal)) {
        setGoal(saved.goal);
      }
      if (typeof saved.customGoal === "string") setCustomGoal(saved.customGoal);
    } catch {
      // noop
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextGoalError = goal ? "" : "대화 목표를 선택해주세요.";
    const nextCustomError = goal === "custom" && customGoal.trim().length === 0 ? "내용을 입력해주세요." : "";

    setGoalError(nextGoalError);
    setCustomError(nextCustomError);

    if (nextGoalError || nextCustomError) {
      return;
    }

    if (!goal) {
      return;
    }

    setIsSubmitting(true);
    setSaveError("");

    const payload: StepTwoData = {
      goal,
      customGoal: goal === "custom" ? customGoal.trim() : undefined,
      step: 1,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    void persistOnboardingStep(1, payload, { forceNewSession: true }).catch((error) => {
      console.error("[step-1] remote save failed, continue local flow", error);
    });
    router.push("/step-2");
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
            <span className="text-sm font-medium text-[#655d5a]">Step 1/3</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#edeee8]">
              <div className="h-full w-1/3 bg-[#4a626d] transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-32 pt-20 md:px-6 md:pb-12 md:pt-24">
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

            <form className="space-y-8" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4">
                {GOALS.map((item) => {
                  const isActive = goal === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setGoal(item.value);
                        setGoalError("");
                        if (item.value !== "custom") setCustomError("");
                      }}
                      className={`group relative rounded-2xl border-2 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 ${isActive
                        ? "border-[#4a626d] bg-white shadow-sm"
                        : "border-transparent bg-[#f4f4ef] hover:bg-[#ffffff]"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid h-8 w-8 place-items-center rounded-full transition-all ${isActive
                            ? "bg-[#cde6f4] text-[#3e5560]"
                            : "bg-[#e6e9e2] text-[#4a626d] opacity-90 group-hover:opacity-100"
                            }`}
                        >
                          <GoalIcon name={item.icon} active={isActive} />
                        </span>
                        <p className="text-base font-semibold text-[#2f342e] md:text-lg">{item.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {goalError ? <p className="ml-1 text-sm text-[#9f403d]">{goalError}</p> : null}

              {goal === "custom" ? (
                <div className="space-y-2">
                  <textarea
                    value={customGoal}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setCustomGoal(nextValue);
                      if (customError && nextValue.trim().length > 0) setCustomError("");
                    }}
                    placeholder="당신의 마음을 적어주세요..."
                    className="min-h-[120px] w-full resize-none rounded-2xl border-none bg-[#e6e9e2] p-6 text-[#5c605a] outline-none ring-0 transition-all duration-300 focus:bg-white focus:ring-1 focus:ring-[#4a626d]/20"
                  />
                  <p className="text-right text-xs text-[#f0f5f2]/70">구체적으로 적을수록 더 깊은 대화가 가능해요.</p>
                  {customError ? <p className="ml-1 text-sm text-[#9f403d]">{customError}</p> : null}
                </div>
              ) : null}

              <div className="pt-0 md:pt-2">
                <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] md:static md:left-auto md:right-auto md:z-auto">
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
                        다음으로
                        <span className="transition-transform group-hover:translate-x-1">
                          <ArrowRightIcon />
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {saveError ? <p className="mt-3 text-center text-sm text-[#9f403d]">{saveError}</p> : null}
              </div>
            </form>
          </div>
        </div>
      </main>
      <HomeConfirmModal 
        isOpen={isHomeModalOpen} 
        onClose={() => setIsHomeModalOpen(false)} 
      />
      <SignupCompleteModal />
    </div>
  );
}
