"use client";

import { useSession, signOut } from "next-auth/react";
import Navigation from "@/app/_components/Navigation";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

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

      <main className="lg:pl-64">
        <div className="mx-auto max-w-4xl px-6 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-12 md:pb-20 lg:pt-32">
          {/* Page Header */}
          <header className="mb-12 text-center md:text-left">
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-[#2f342e] md:text-4xl">
              내 계정 설정
            </h1>
            <p className="mt-2 text-[#655d5a]">
              로그인된 계정 정보를 관리하고 개인설정을 변경할 수 있습니다.
            </p>
          </header>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Primary Info Card */}
            <section className="lg:col-span-12">
              <div className="overflow-hidden rounded-[2.5rem] border border-[#afb3ac]/20 bg-white p-8 shadow-[0_12px_32px_rgba(47,52,46,0.05)] md:p-12">
                <div className="flex flex-col items-center gap-10 md:flex-row">
                  {/* Profile Image Area */}
                  <div className="relative group">
                    <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-[#faf9f5] bg-[#4a626d] shadow-2xl transition-transform hover:scale-105">
                      {session.user?.image ? (
                        <img
                          src={session.user.image}
                          alt="Profile"
                          className="h-full w-full object-cover"
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
                  </div>
                </div>

                {/* Account Details/Settings Grid */}
                <div className="mt-16 grid grid-cols-1 gap-6 border-t border-[#afb3ac]/10 pt-10 md:grid-cols-2">
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

            {/* Danger Zone/Secondary Actions */}
            <section className="lg:col-span-12 mt-12">
               <div className="flex flex-col items-center justify-between gap-6 rounded-[2.5rem] bg-[#f4f4ef] p-10 md:flex-row border border-[#afb3ac]/20 shadow-sm transition-all hover:shadow-md">
                  <div className="text-center md:text-left">
                    <h3 className="font-headline text-xl font-extrabold text-[#2f342e]">서비스 나가기</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[#655d5a]">
                      언제든 다시 돌아오실 수 있습니다. 대화 기록은 안전하게 보관됩니다.
                    </p>
                  </div>
                  <button 
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full shrink-0 rounded-2xl bg-[#9f403d] px-10 py-4 text-base font-extrabold text-white shadow-xl shadow-[#9f403d]/20 transition-all hover:scale-[1.03] active:scale-95 md:w-auto"
                  >
                    로그아웃
                  </button>
               </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
