"use client";

import { useRouter } from "next/navigation";

export default function HomeConfirmModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="mb-6 text-center">
          <h2 className="font-headline mb-3 text-2xl font-bold text-[#2f342e]">홈으로 돌아갈까요?</h2>
          <p className="text-sm leading-relaxed text-[#655d5a]">
            작성 내용은 임시 저장돼요.
            <br />
            언제든 이어서 만들 수 있어요.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              // Clear any draft if needed, but the user just wants to go home
              router.push("/");
            }}
            className="w-full rounded-2xl bg-[#9f403d] py-4 text-base font-bold text-white shadow-lg shadow-[#9f403d]/20 transition-all hover:scale-[1.02] active:scale-95"
          >
            홈으로 이동
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-[#4a626d] py-4 text-base font-bold text-white shadow-lg shadow-[#4a626d]/10 transition-all hover:scale-[1.02] active:scale-95"
          >
            계속 작성하기
          </button>
        </div>
      </div>
    </div>
  );
}
