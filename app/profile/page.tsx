"use client";

import { useSession, signOut } from "next-auth/react";
import Navigation from "@/app/_components/Navigation";
import LogoutConfirmModal from "@/app/_components/LogoutConfirmModal";
import MemoryBalanceBadge from "@/app/_components/MemoryBalanceBadge";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const BRAND_BORDER_COLOR = "#3e5560";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isProfileImageFailed, setIsProfileImageFailed] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut({ callbackUrl: "/" });
    } finally {
      setIsSigningOut(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    const loadMemoryPassStatus = async () => {
      try {
        const response = await fetch("/api/memory-pass", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setIsSubscribed(Boolean(data?.isSubscribed));
          setMemoryBalance(Number(data?.memoryBalance ?? 0));
        }
      } catch {
        if (!cancelled) {
          setIsSubscribed(false);
          setMemoryBalance(null);
        }
      }
    };

    loadMemoryPassStatus();

    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f5]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#faf9f5]">
      <Navigation />

      <header className="fixed top-0 z-40 w-full border-b border-[#d6ddd8] bg-[#ffffff]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-center px-3 md:px-6">
          <h1 className="font-headline text-lg font-bold tracking-tight text-[#4a626d]">내 계정 설정</h1>
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-4xl px-3 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] md:px-6 md:pb-20 md:pt-20">
          {/* Page Header */}
          <header className="mb-10 hidden text-center lg:block">
            <h1 className="font-headline text-lg font-bold tracking-tight text-[#4a626d]">
              내 계정 설정
            </h1>
          </header>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Primary Info Card */}
            <section className="lg:col-span-12">
              <div
                className="overflow-hidden rounded-[2.5rem] border bg-white p-8 shadow-[0_12px_32px_rgba(47,52,46,0.05)] md:p-12"
                style={{ borderColor: BRAND_BORDER_COLOR }}
              >
                <div className="flex flex-col items-center gap-10 md:flex-row">
                  {/* Profile Image Area */}
                  <div className="relative group">
                    <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-[#faf9f5] bg-[#4a626d] shadow-2xl transition-transform hover:scale-105">
                      {session.user?.image && !isProfileImageFailed ? (
                        <img
                          src={session.user.image}
                          alt="Profile"
                          className="h-full w-full object-cover"
                          onError={() => setIsProfileImageFailed(true)}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-white uppercase">
                          {session.user?.name?.[0] || "U"}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* User Details */}
                  <div className="flex-1 text-center md:text-left">
                    <h2 className="font-headline text-2xl font-extrabold text-[#2f342e]">
                      {session.user?.name || "사용자"}
                    </h2>
                    <p className="mt-1 text-lg text-[#655d5a]">
                      {session.user?.email || "이메일 정보가 없습니다."}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                      <span className="inline-flex items-center rounded-full bg-[#f4f4ef] px-4 py-1.5 text-sm font-semibold text-[#4a626d]">
                         소셜 로그인 연결됨
                      </span>
                    </div>
                    <div className="mt-4 rounded-2xl border bg-[#f4f4ef] p-4" style={{ borderColor: BRAND_BORDER_COLOR }}>
                      <p className="text-xs font-bold uppercase tracking-widest text-[#7b827d]">현재 구독 정보</p>
                      <p className="mt-2 text-sm font-semibold text-[#2f342e]">
                        {isSubscribed ? "기억 패스 활성화됨" : "기억 패스 미활성"}
                      </p>
                      <div className="mt-2">
                        <MemoryBalanceBadge memoryBalance={memoryBalance} showBorder={false} />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
                      <button
                        type="button"
                        onClick={() => router.push("/payment?returnTo=%2Fprofile")}
                        className="rounded-xl bg-[#4a626d] px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#4a626d]/20 transition-all hover:scale-[1.02] active:scale-95"
                      >
                        {isSubscribed ? "구독 관리" : "기억 업그레이드"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Account Details/Settings Grid */}
                <div className="mt-16 grid grid-cols-1 gap-6 border-t pt-10 md:grid-cols-2" style={{ borderColor: BRAND_BORDER_COLOR }}>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-[#afb3ac]">이름</label>
                    <div className="flex items-center gap-2 rounded-2xl bg-[#f4f4ef] px-4 py-3 text-[#2f342e]">
                      <span className="font-medium">{session.user?.name}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-[#afb3ac]">이메일 주소</label>
                    <div className="flex items-center gap-2 rounded-2xl bg-[#f4f4ef] px-4 py-3 text-[#2f342e]">
                      <span className="font-medium">{session.user?.email}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="lg:col-span-12">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => router.push("/profile/memory-history")}
                  className="flex items-center justify-between rounded-2xl border bg-white px-5 py-4 text-left transition-colors hover:bg-[#f4f4ef]"
                  style={{ borderColor: BRAND_BORDER_COLOR }}
                >
                  <span className="text-sm font-extrabold text-[#3e5560]">기억 사용 내역</span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#3e5560]" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/profile/account-settings")}
                  className="flex items-center justify-between rounded-2xl border bg-white px-5 py-4 text-left transition-colors hover:bg-[#f4f4ef]"
                  style={{ borderColor: BRAND_BORDER_COLOR }}
                >
                  <span className="text-sm font-extrabold text-[#3e5560]">계정 정보 및 설정</span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#3e5560]" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </section>

            <section className="mt-12 lg:hidden">
              <button
                onClick={() => {
                  setIsLogoutModalOpen(true);
                }}
                className="w-full rounded-2xl bg-[#9f403d] px-10 py-4 text-base font-extrabold text-white shadow-xl shadow-[#9f403d]/20 transition-all active:scale-95"
              >
                로그아웃
              </button>
            </section>
          </div>
        </div>
      </main>

      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        isProcessing={isSigningOut}
        onClose={() => {
          if (isSigningOut) return;
          setIsLogoutModalOpen(false);
        }}
        onConfirm={() => {
          void handleSignOut();
        }}
      />
    </div>
  );
}
