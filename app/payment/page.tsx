"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MEMORY_PASS_PRICE_KRW } from "@/lib/memory-pass/config";
import Navigation from "@/app/_components/Navigation";
import SiteFooter from "@/app/_components/SiteFooter";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";
import MemoryBalanceBadge from "@/app/_components/MemoryBalanceBadge";

function formatKrw(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function discountPercent(original: number, sale: number) {
  if (original <= 0 || sale >= original) return 0;
  return Math.round(((original - sale) / original) * 100);
}

function MemoryMark({ className = "h-5 w-5 text-[#bfe4f5]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.5v4.2l2.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/profile";
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);

  const memoryPassOriginalPrice = 25900;

  const memoryPackBase = 1990;
  const memoryPack200Price = 1990;
  const memoryPack1000Original = memoryPackBase * 5;
  const memoryPack20000Original = memoryPackBase * 100;
  const memoryPack1000Price = 8490;
  const memoryPack20000Price = 139000;
  const memoryPack200Discount = discountPercent(memoryPack200Price, memoryPack200Price);
  const memoryPack1000Discount = discountPercent(memoryPack1000Original, memoryPack1000Price);
  const memoryPack20000Discount = discountPercent(memoryPack20000Original, memoryPack20000Price);

  useNativeSwipeBack(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(returnTo);
  });

  useEffect(() => {
    let cancelled = false;

    const loadMemoryBalance = async () => {
      try {
        const response = await fetch("/api/memory-pass", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setMemoryBalance(Number(data?.memoryBalance ?? 0));
        }
      } catch {
        if (!cancelled) {
          setMemoryBalance(null);
        }
      }
    };

    loadMemoryBalance();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMemoryPassAction = () => {
    setPendingNotice("스토어 결제 심사 대기 중입니다. 결제 기능은 출시 후 활성화됩니다.");
  };

  const handleComingSoonAction = () => {
    setPendingNotice("출시 준비중입니다. 스토어 결제 오픈 후 이용할 수 있어요.");
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#242926] text-[#2f342e]">
      <Navigation />

      <nav className="fixed top-0 left-0 z-50 w-full border-b border-white/5 bg-[#242926]/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="relative mx-auto flex h-16 w-full max-w-screen-2xl items-center px-3 md:px-4 lg:px-10">
          <div>
            <Link
              href={returnTo}
              aria-label="뒤로가기"
              className="inline-flex items-center justify-center rounded-xl p-2 text-[#4a626d] transition-colors hover:bg-[#eef2ef] hover:text-[#2f342e]"
            >
              <ArrowLeftIcon />
            </Link>
          </div>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-headline text-lg font-bold tracking-tight text-[#2f342e]">기억 스토어</h1>
          <div className="ml-auto">
            <MemoryBalanceBadge memoryBalance={memoryBalance} showBorder={false} className="gap-1.5 px-2.5" />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-[calc(6rem+env(safe-area-inset-top))] md:px-6 lg:px-10">
        <section className="mb-6 rounded-2xl border border-[#b8ceda]/60 bg-[#2f3632] p-4">
          <p className="text-sm font-bold text-[#d9e9f1]">출시 준비중</p>
          <p className="mt-1 text-xs text-[#bfd4df]">
            현재 스토어 결제 심사 대기 상태입니다. 결제 관련 기능은 심사 승인 후 순차적으로 열릴 예정입니다.
          </p>
        </section>

        {pendingNotice ? (
          <section className="mb-6 rounded-2xl border border-[#9fbccc]/60 bg-[#313a35] p-4">
            <p className="text-sm font-semibold text-[#d8e8f1]">{pendingNotice}</p>
          </section>
        ) : null}

        <div className="mb-20 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <article
            className="relative overflow-hidden rounded-[2rem] border border-[#b8ceda]/80 p-8 shadow-2xl lg:col-span-7 lg:p-10"
            style={{
              backgroundColor: "#7a97a6",
              backgroundImage: "linear-gradient(215deg, #6f8998 0%, #89a5b4 100%)",
            }}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/20 blur-3xl" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-8">
              <div>
                <h2 className="font-headline text-3xl font-bold text-[#f8fbff] md:text-4xl">기억 패스</h2>
                <p className="mt-3 text-base font-semibold text-[#eff7fb] md:text-lg">말투와 기억을 더 길고 정확하게 반영해요.</p>

                <ul className="mt-8 space-y-3 text-[#f7fbff]">
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                    생성 가능한 기억 최대 15개
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                    매달 1,500 기억 자동 지급
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                    기억 조각 입력 한도 10배 확장
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                    입버릇 입력 한도 10배 확장
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                    대화 핵심 성향(서술형) 작성 가능
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-[#e5eff4] line-through">{formatKrw(memoryPassOriginalPrice)}원</p>
                  <div className="flex items-end gap-2">
                    <p className="font-headline text-3xl font-bold text-[#f8fbff] md:text-4xl">{formatKrw(MEMORY_PASS_PRICE_KRW)}원</p>
                    <p className="pb-1 text-sm text-[#ecf5fa]">/월</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleMemoryPassAction}
                  className="inline-flex items-center justify-center rounded-xl border border-white/85 bg-white px-8 py-4 text-lg font-bold text-[#3e5560] shadow-xl shadow-black/20 transition-colors hover:bg-[#f3f8fb] disabled:opacity-60"
                >
                  출시 준비중
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-[#2c322f] p-8 shadow-xl lg:col-span-5 lg:p-10">
            <h2 className="font-headline text-3xl font-bold text-[#2f342e]">무제한 대화 이용권</h2>
            <p className="mt-3 text-base font-medium text-[#4a626d] md:text-lg">하루 동안 무제한으로 대화를 이어가세요.</p>

            <div className="mt-8 space-y-3">
              <div className="rounded-xl bg-[#38403b] p-4">
                <p className="font-bold text-[#2f342e]">24시간, 완전 무제한</p>
                <p className="mt-1 text-sm text-[#5d605a]">사용량 상관 없이 원하는 만큼 대화 가능</p>
              </div>
              <div className="rounded-xl bg-[#38403b] p-4">
                <p className="font-bold text-[#2f342e]">결제 즉시 시작</p>
                <p className="mt-1 text-sm text-[#5d605a]">지금 바로 깊은 대화로 전환</p>
              </div>
            </div>

            <div className="mt-10">
              <p className="font-headline text-3xl font-bold text-[#2f342e]">
                {formatKrw(29900)}원 <span className="text-sm text-[#5d605a]">/ 24시간</span>
              </p>
              <button
                type="button"
                onClick={handleComingSoonAction}
                className="mt-5 w-full rounded-xl bg-[#4a626d] px-6 py-4 font-bold text-[#f0f9ff] shadow-xl shadow-black/20 transition-colors hover:bg-[#3e5661]"
              >
                출시 준비중
              </button>
            </div>
          </article>
        </div>

        <section>
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-headline text-4xl font-bold text-[#2f342e]">기억 충전하기</h2>
              <p className="mt-2 text-[#5d605a]">
                <span className="md:hidden">충전된 기억은 계정에 누적 보관됩니다.</span>
                <span className="hidden md:inline">대화 도중 기억이 부족할 때, 필요한 만큼 충전하세요.</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 md:gap-2.5 lg:gap-3.5">
            <div className="relative flex justify-center pt-1.5 lg:pt-2">
              <button
                type="button"
                onClick={handleComingSoonAction}
                className="relative flex w-[108px] cursor-default flex-col items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                {memoryPack200Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack200Discount}%
                  </span>
                ) : null}
                <div className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#38403b] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]">
                  <MemoryMark className="h-7 w-7 text-[#3e5560] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#2f342e] md:text-base lg:text-lg xl:text-xl">200기억</h3>
                </div>
                <div className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]">
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack200Price)}원</p>
                </div>
              </button>
            </div>

            <div className="relative flex justify-center pt-1.5 lg:pt-2">
              <button
                type="button"
                onClick={handleComingSoonAction}
                className="relative z-[1] flex w-[108px] cursor-default flex-col items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                <div className="pointer-events-none absolute right-0 top-0 z-0 h-20 w-20 rounded-full bg-[#7fa4b6]/20 blur-2xl" />
                {memoryPack1000Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack1000Discount}%
                  </span>
                ) : null}
                <div className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#303733] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]">
                  <MemoryMark className="h-7 w-7 text-[#3e5560] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#2f342e] md:text-base lg:text-lg xl:text-xl">1,000기억</h3>
                </div>
                <div className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]">
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack1000Price)}원</p>
                </div>
              </button>
            </div>

            <div className="relative flex justify-center pt-1.5 lg:pt-2">
              <button
                type="button"
                onClick={handleComingSoonAction}
                className="relative flex w-[108px] cursor-default flex-col items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                {memoryPack20000Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack20000Discount}%
                  </span>
                ) : null}
                <div className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#38403b] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]">
                  <MemoryMark className="h-7 w-7 text-[#3e5560] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#2f342e] md:text-base lg:text-lg xl:text-xl">20,000기억</h3>
                </div>
                <div className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]">
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack20000Price)}원</p>
                </div>
              </button>
            </div>
          </div>
        </section>

        <div className="mt-12 border-t border-white/10" />

        <section className="mt-16 space-y-6 text-xs leading-relaxed text-[#5d605a] md:text-sm">
          <div>
            <p className="mb-2 font-semibold text-[#4a626d]">안내</p>
            <p>· 현재 결제 기능은 스토어 심사 대기 상태이며 실제 결제가 진행되지 않습니다.</p>
            <p>· 심사 승인 후 App Store / Google Play 인앱결제로만 결제가 활성화됩니다.</p>
            <p>· 결제 기능 오픈 시 정책 및 이용 조건이 함께 공지됩니다.</p>
          </div>
        </section>

      </main>

      <SiteFooter />
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#242926]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
