"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { isMemoryPassOwnershipConflictError, purchaseIapProduct } from "@/lib/iap/client";

type MemoryPassExpiredLockOverlayProps = {
  open: boolean;
  onClose: () => void;
  returnTo?: string;
  title?: string;
  description?: string;
  onSubscribed?: () => void | Promise<void>;
};

export default function MemoryPassExpiredLockOverlay({
  open,
  onClose,
  returnTo = "/",
  title = "기억 패스가 만료되었어요",
  description = "이 기억은 잠금 상태입니다.\n구독하면 바로 다시 대화할 수 있어요.",
  onSubscribed,
}: MemoryPassExpiredLockOverlayProps) {
  const router = useRouter();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, [open]);

  const handleSubscribe = async () => {
    if (isPurchasing) return;
    setNotice(null);

    if (!Capacitor.isNativePlatform()) {
      router.push(`/payment?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    setIsPurchasing(true);
    try {
      await purchaseIapProduct("memory_pass_monthly");
      if (onSubscribed) {
        await onSubscribed();
      } else if (typeof window !== "undefined") {
        window.location.reload();
      }
      onClose();
    } catch (error) {
      if (isMemoryPassOwnershipConflictError(error)) {
        setNotice(error.message);
      } else {
        setNotice(error instanceof Error ? error.message : "결제를 진행하지 못했습니다.");
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[190] grid place-items-center bg-black/45 px-4 backdrop-blur-[1px]">
      <section className="w-full max-w-sm rounded-[2rem] bg-white p-7 text-center shadow-2xl animate-fade-in">
        <h3 className="font-headline text-xl font-bold text-[#2f342e]">{title}</h3>
        <p className="mt-3 whitespace-pre-line break-keep text-sm leading-relaxed text-[#5d605a]">{description}</p>
        {notice ? <p className="mt-3 break-keep text-xs font-semibold text-[#b42318]">{notice}</p> : null}
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#d9dde1] bg-white px-4 py-3.5 text-sm font-semibold text-[#4b5563] hover:bg-[#f3f4f6] transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={isPurchasing}
            className="rounded-2xl bg-[#4a626d] px-4 py-3.5 text-sm font-extrabold text-[#f0f9ff] shadow-lg shadow-[#4a626d]/20 transition-colors hover:bg-[#3e5661] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPurchasing ? "처리중..." : "구독하기"}
          </button>
        </div>
      </section>
    </div>
  );
}
