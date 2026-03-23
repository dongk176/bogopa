"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearOnboardingDraft, persistOnboardingStep } from "@/lib/onboarding-client";
import { PERSONA_ANALYSIS_STORAGE_KEY, PERSONA_RUNTIME_STORAGE_KEY } from "@/lib/persona/storage";

type Gender = "Male" | "Female";

type ProfileData = {
  name: string;
  gender: Gender;
  step: number;
  updatedAt: string;
};

const STORAGE_KEY = "bogopa_profile_step1";

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 19.4a6.6 6.6 0 0 1 13 0" />
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
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [nameError, setNameError] = useState("");
  const [genderError, setGenderError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const hasPreviousPersona =
      Boolean(window.localStorage.getItem(PERSONA_RUNTIME_STORAGE_KEY)) ||
      Boolean(window.localStorage.getItem(PERSONA_ANALYSIS_STORAGE_KEY));
    if (hasPreviousPersona) {
      clearOnboardingDraft();
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as Partial<ProfileData>;
      if (typeof saved.name === "string") setName(saved.name);
      if (saved.gender === "Male" || saved.gender === "Female") setGender(saved.gender);
    } catch {
      // noop
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const nextNameError = trimmedName.length === 0 ? "성함을 입력해주세요." : "";
    const nextGenderError = !gender ? "성별을 선택해주세요." : "";

    setNameError(nextNameError);
    setGenderError(nextGenderError);

    if (nextNameError || nextGenderError) {
      return;
    }

    if (!gender) {
      return;
    }

    setIsSubmitting(true);
    setSaveError("");

    const payload: ProfileData = {
      name: trimmedName,
      gender,
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
          <div className="flex items-center gap-2">
            <img src="/logo/bogopa%20logo.png" alt="보고파" className="h-8 w-auto object-contain" />
            <span className="font-headline text-2xl font-bold tracking-tight text-[#4a626d]">Bogopa</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#655d5a]">Step 1/4</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#edeee8]">
              <div className="h-full w-1/4 bg-[#4a626d] transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-28 pt-16 md:px-6 md:pb-12">
        <div className="relative w-full max-w-xl overflow-visible rounded-none bg-transparent p-0 shadow-none md:overflow-hidden md:rounded-[2rem] md:bg-[#303733] md:p-12 md:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
          <div className="absolute -right-10 -top-10 -z-0 hidden h-40 w-40 bg-[#cde6f4]/20 [border-radius:40%_60%_70%_30%/40%_50%_60%_50%] md:block" />

          <div className="relative z-10">
            <div className="mb-10 text-center md:text-left">
              <h1 className="font-headline mb-4 text-3xl font-bold tracking-tight text-[#f0f5f2] md:text-4xl">
                당신에 대해 알려주세요.
              </h1>
            </div>

            <form className="space-y-10" onSubmit={handleSubmit}>
              <div className="space-y-3">
                <label className="ml-1 block text-sm font-semibold text-[#f0f5f2]" htmlFor="userName">
                  성함 <span className="text-[#9f403d]">*</span>
                </label>
                <div className="group relative">
                  <input
                    id="userName"
                    name="userName"
                    type="text"
                    placeholder="이름을 입력하세요"
                    value={name}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setName(nextValue);
                      if (nameError && nextValue.trim().length > 0) setNameError("");
                    }}
                    className={`w-full rounded-xl border-none bg-[#f4f4ef] px-6 py-4 pr-12 text-lg text-[#2f342e] placeholder:text-[#787c75] outline-none ring-0 transition-all duration-300 focus:ring-2 ${nameError ? "focus:ring-[#9f403d]/30" : "focus:ring-[#4a626d]/20"
                      }`}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#787c75] group-focus-within:text-[#4a626d]">
                    <PersonIcon />
                  </div>
                </div>
                {nameError ? <p className="ml-1 text-sm text-[#9f403d]">{nameError}</p> : null}
              </div>

              <div className="space-y-4">
                <label className="ml-1 block text-sm font-semibold text-[#f0f5f2]">
                  성별 <span className="text-[#9f403d]">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setGender("Male");
                      if (genderError) setGenderError("");
                    }}
                    className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 px-4 py-6 transition duration-300 ${gender === "Male"
                      ? "border-[#24303a] bg-[#cce2f0] text-[#14191d] shadow-inner shadow-[#24303a]/30"
                      : "border-transparent bg-[#f4f4ef] text-[#655d5a] hover:bg-[#e6e9e2]"
                      }`}
                  >
                    <MaleIcon />
                    <span className="font-medium">남성</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGender("Female");
                      if (genderError) setGenderError("");
                    }}
                    className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 px-4 py-6 transition-all duration-300 ${gender === "Female"
                      ? "border-[#8d305a] bg-[#ffd3e3] text-[#4a2c3f]"
                      : "border-transparent bg-[#f4f4ef] text-[#655d5a] hover:bg-[#e6e9e2]"
                      }`}
                  >
                    <FemaleIcon />
                    <span className="font-medium">여성</span>
                  </button>
                </div>
                {genderError ? <p className="ml-1 text-sm text-[#9f403d]">{genderError}</p> : null}
              </div>

              <div className="pt-0 md:pt-6">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-6 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:static md:left-auto md:right-auto md:z-auto md:w-full md:rounded-2xl md:px-0 md:py-5 md:text-lg md:font-bold md:shadow-lg"
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
                {saveError ? <p className="mt-3 text-center text-sm text-[#9f403d]">{saveError}</p> : null}

              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
