"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearOnboardingDraft } from "@/lib/onboarding-client";

const STEP_DRAFT_KEYS = ["bogopa_profile_step2", "bogopa_profile_step3", "bogopa_profile_step4"] as const;

export default function StepOneStartPage() {
  const router = useRouter();
  const [hasDraft, setHasDraft] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const foundDraft = STEP_DRAFT_KEYS.some((key) => {
      const value = window.localStorage.getItem(key);
      return typeof value === "string" && value.trim().length > 0;
    });

    if (!foundDraft) {
      router.replace("/step-1");
      return;
    }

    setHasDraft(true);
    setIsReady(true);
  }, [router]);

  if (!isReady || !hasDraft) {
    return <div className="min-h-screen bg-[#faf9f5]" />;
  }

  return (
    <div className="min-h-screen bg-[#faf9f5]">
      <div className="fixed inset-0 z-[180] grid place-items-center bg-black/45 px-4 backdrop-blur-[1px]">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl shadow-black/20">
          <h3 className="text-left font-headline text-2xl font-bold text-[#2f342e]">이전에 작성하던 내 기억이 있어요</h3>
          <p className="mt-3 text-left text-sm leading-relaxed text-[#5d605a]">이어서 작성하거나 삭제 후 새로 시작할 수 있어요.</p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                clearOnboardingDraft();
                router.replace("/step-1");
              }}
              className="rounded-2xl bg-[#9f403d] px-4 py-3 text-sm font-bold text-[#fff7f6] transition-opacity hover:opacity-90 active:opacity-90"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() => router.replace("/step-1")}
              className="rounded-2xl bg-[#4a626d] px-4 py-3 text-sm font-bold text-[#f0f9ff] hover:bg-[#3e5661]"
            >
              이어서 작성하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
