"use client";

import { useRouter } from "next/navigation";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";

type LegalMobileHeaderProps = {
  title: string;
  backHref?: string;
};

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 18 9 12l6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LegalMobileHeader({ title, backHref }: LegalMobileHeaderProps) {
  const router = useRouter();

  useNativeSwipeBack(() => {
    if (backHref) {
      router.push(backHref);
      return;
    }
    router.push("/");
  });

  function handleBack() {
    if (backHref) {
      router.push(backHref);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#242926]/80 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
      <div className="relative mx-auto flex h-16 w-full items-center px-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#afb3ac] transition-colors hover:bg-white/5 hover:text-[#f0f9ff]"
          aria-label="뒤로가기"
        >
          <BackIcon />
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 text-center font-headline text-base font-bold tracking-tight text-[#f0f9ff]">
          {title}
        </h1>
      </div>
    </header>
  );
}
