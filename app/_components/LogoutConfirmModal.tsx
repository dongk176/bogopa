"use client";

import { useEffect } from "react";

type LogoutConfirmModalProps = {
  isOpen: boolean;
  isProcessing?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function LogoutConfirmModal({
  isOpen,
  isProcessing = false,
  onClose,
  onConfirm,
}: LogoutConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isProcessing) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#1f2421] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
        <h3 className="font-headline text-xl font-bold text-[#f0f5f2]">로그아웃 하시겠어요?</h3>
        <p className="mt-3 text-sm leading-relaxed text-[#5d605a]">
          현재 계정에서 로그아웃됩니다.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-2xl border border-[#afb3ac]/35 px-4 py-3 text-sm font-semibold text-[#f0f5f2] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="rounded-2xl bg-[#9f403d] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessing ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      </section>
    </div>
  );
}
