"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SIGNUP_COMPLETE_MODAL_PENDING_KEY } from "@/lib/onboarding-flags";

export default function SignupCompleteModal() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const shouldOpen = window.localStorage.getItem(SIGNUP_COMPLETE_MODAL_PENDING_KEY) === "1";
    if (!shouldOpen) return;
    setIsOpen(true);
    setIsClosing(false);
    const rafId = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });
    document.body.classList.add("modal-open");
    return () => {
      window.cancelAnimationFrame(rafId);
      setIsVisible(false);
      document.body.classList.remove("modal-open");
    };
  }, []);

  function closeModal(moveToStepOne: boolean) {
    if (isClosing) return;
    setIsClosing(true);
    window.localStorage.removeItem(SIGNUP_COMPLETE_MODAL_PENDING_KEY);
    window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setIsVisible(false);
      document.body.classList.remove("modal-open");
      if (moveToStepOne && pathname !== "/step-1") {
        router.push("/step-1");
      }
    }, 260);
  }

  function handleStart() {
    closeModal(true);
  }

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center px-4 backdrop-blur-md transition-all duration-300 ${
        isClosing ? "bg-black/35" : isVisible ? "bg-black/65" : "bg-black/0"
      }`}
    >
      <div
        className={`w-full max-w-sm rounded-[2.5rem] border border-[#d6dde2] bg-white px-6 pb-8 pt-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.18)] transition-all duration-300 ${
          isClosing ? "translate-y-1 scale-[0.985] opacity-95" : isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <div
          className={`mb-8 flex flex-col gap-2 transition-all duration-300 ${
            isClosing ? "translate-y-1 opacity-0" : isVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          }`}
        >
          <h2 className="font-headline text-2xl font-bold tracking-tight text-[#24303a]">환영합니다!</h2>
          <p className="text-sm font-medium text-[#5c6870] leading-relaxed">
            <span className="inline-flex flex-wrap items-center justify-center gap-x-1 gap-y-0 align-middle">
              <span>가입 축하 선물로</span>
              <span className="inline-flex items-center gap-1 text-[#4a626d]">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6.3v4.2l2.7 1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="0.8" fill="currentColor" stroke="none" />
                </svg>
                <span>60기억</span>
              </span>
              <span>이 충전되었습니다.</span>
            </span>
          </p>
          <p className="text-sm font-medium text-[#5c6870]">기억으로는 내 기억 생성과 대화를 이어나갈 수 있습니다.</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={isClosing}
            className={`inline-flex w-full items-center justify-center rounded-2xl bg-[#4a626d] px-6 py-4 text-[15px] font-bold text-[#f0f9ff] transition-all duration-300 hover:bg-[#3e5560] active:scale-[0.98] ${
              isClosing ? "cursor-default opacity-80" : ""
            }`}
          >
            {isClosing ? "내 기억으로 이동 중..." : "내 기억으로 대화 시작하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
