"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MEMORY_PASS_PRICE_KRW } from "@/lib/memory-pass/config";
import Navigation from "@/app/_components/Navigation";
import SiteFooter from "@/app/_components/SiteFooter";

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
  const [isPassActionLoading, setIsPassActionLoading] = useState(false);
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    const loadMemoryBalance = async () => {
      try {
        const response = await fetch("/api/memory-pass", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setMemoryBalance(Number(data?.memoryBalance ?? 0));
          setIsSubscribed(Boolean(data?.isSubscribed));
        }
      } catch {
        if (!cancelled) {
          setMemoryBalance(null);
          setIsSubscribed(false);
        }
      }
    };

    loadMemoryBalance();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMemoryPassAction = async () => {
    if (isPassActionLoading) return;
    setIsPassActionLoading(true);
    const action = isSubscribed ? "deactivate" : "activate";
    try {
      const response = await fetch("/api/memory-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("memory pass action failed");
      const payload = (await response.json()) as { isSubscribed?: boolean; memoryBalance?: number };
      setIsSubscribed(Boolean(payload?.isSubscribed));
      setMemoryBalance(Number(payload?.memoryBalance ?? 0));
      router.push(returnTo);
    } catch {
      setIsPassActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#242926] text-[#d9e1da]">
      <Navigation />

      <nav className="fixed top-0 left-0 z-50 w-full border-b border-white/5 bg-[#242926]/80 backdrop-blur-md">
        <div className="relative mx-auto flex h-16 w-full max-w-screen-2xl items-center px-3 md:px-4 lg:px-10">
          <div>
            <Link
              href={returnTo}
              aria-label="뒤로가기"
              className="inline-flex items-center justify-center rounded-xl p-2 text-[#afb3ac] transition-colors hover:bg-white/5 hover:text-[#f0f9ff]"
            >
              <ArrowLeftIcon />
            </Link>
          </div>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-headline text-lg font-bold tracking-tight text-[#f0f9ff]">기억 스토어</h1>
          <div className="ml-auto">
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#303733] px-3 py-2">
              <MemoryMark />
              <span className="text-sm font-extrabold text-[#f0f5f2]">{memoryBalance === null ? "..." : `${formatKrw(memoryBalance)}`}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-24 md:px-6 lg:px-10">
        <div className="mb-20 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <article className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#303733] p-8 shadow-2xl lg:col-span-7 lg:p-10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#4a626d]/20 blur-3xl" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-8">
              <div>
                <h2 className="font-headline text-3xl font-bold text-[#f0f5f2] md:text-4xl">기억 패스</h2>
                <p className="mt-3 text-base font-medium text-[#b9cad1] md:text-lg">말투와 기억을 더 길고 정확하게 반영해요.</p>

                <ul className="mt-8 space-y-3 text-[#d9e1da]">
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#7fa4b6]" />
                    생성 가능한 기억 최대 15개
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#7fa4b6]" />
                    매달 1,500 기억 자동 지급
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#7fa4b6]" />
                    기억 조각 입력 한도 10배 확장
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#7fa4b6]" />
                    입버릇 입력 한도 10배 확장
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#7fa4b6]" />
                    대화 핵심 성향(서술형) 작성 가능
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-[#8d9690] line-through">{formatKrw(memoryPassOriginalPrice)}원</p>
                  <div className="flex items-end gap-2">
                    <p className="font-headline text-3xl font-bold text-[#f0f5f2] md:text-4xl">{formatKrw(MEMORY_PASS_PRICE_KRW)}원</p>
                    <p className="pb-1 text-sm text-[#afb3ac]">/월</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleMemoryPassAction}
                  disabled={isPassActionLoading}
                  className={`inline-flex items-center justify-center rounded-xl px-8 py-4 text-lg font-bold text-[#f0f9ff] shadow-xl shadow-black/20 transition-colors disabled:opacity-60 ${
                    isSubscribed ? "bg-[#9f403d] hover:bg-[#8c3431]" : "bg-[#4a626d] hover:bg-[#3e5661]"
                  }`}
                >
                  {isPassActionLoading ? "처리 중..." : isSubscribed ? "구독 해지" : "구독하기"}
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-[#2c322f] p-8 shadow-xl lg:col-span-5 lg:p-10">
            <h2 className="font-headline text-3xl font-bold text-[#f0f5f2]">무제한 대화 이용권</h2>
            <p className="mt-3 text-base font-medium text-[#b9cad1] md:text-lg">하루 동안 무제한으로 대화를 이어가세요.</p>

            <div className="mt-8 space-y-3">
              <div className="rounded-xl bg-[#38403b] p-4">
                <p className="font-bold text-[#f0f5f2]">24시간, 완전 무제한</p>
                <p className="mt-1 text-sm text-[#afb3ac]">사용량 상관 없이 원하는 만큼 대화 가능</p>
              </div>
              <div className="rounded-xl bg-[#38403b] p-4">
                <p className="font-bold text-[#f0f5f2]">결제 즉시 시작</p>
                <p className="mt-1 text-sm text-[#afb3ac]">지금 바로 깊은 대화로 전환</p>
              </div>
            </div>

            <div className="mt-10">
              <p className="font-headline text-3xl font-bold text-[#f0f5f2]">
                {formatKrw(29900)}원 <span className="text-sm text-[#afb3ac]">/ 24시간</span>
              </p>
              <button
                type="button"
                className="mt-5 w-full rounded-xl bg-[#4a626d] px-6 py-4 font-bold text-[#f0f9ff] shadow-xl shadow-black/20 transition-colors hover:bg-[#3e5661]"
              >
                이용권 활성화
              </button>
            </div>
          </article>
        </div>

        <section>
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-headline text-4xl font-bold text-[#f0f5f2]">기억 충전하기</h2>
              <p className="mt-2 text-[#afb3ac]">
                <span className="md:hidden">충전된 기억은 계정에 누적 보관됩니다.</span>
                <span className="hidden md:inline">대화 도중 기억이 부족할 때, 필요한 만큼 충전하세요.</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 md:gap-2.5 lg:gap-3.5">
            <div className="relative flex justify-center pt-1.5 lg:pt-2">
              <button
                type="button"
                className="relative flex w-[108px] cursor-pointer flex-col items-center text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                {memoryPack200Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack200Discount}%
                  </span>
                ) : null}
                <div className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#38403b] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]">
                  <MemoryMark className="h-7 w-7 text-[#bfe4f5] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#f0f5f2] md:text-base lg:text-lg xl:text-xl">200기억</h3>
                </div>
                <div className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]">
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack200Price)}원</p>
                </div>
              </button>
            </div>

            <div className="relative flex justify-center pt-1.5 lg:pt-2">
              <button
                type="button"
                className="relative z-[1] flex w-[108px] cursor-pointer flex-col items-center text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                <div className="pointer-events-none absolute right-0 top-0 z-0 h-20 w-20 rounded-full bg-[#7fa4b6]/20 blur-2xl" />
                {memoryPack1000Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack1000Discount}%
                  </span>
                ) : null}
                <div className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#303733] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]">
                  <MemoryMark className="h-7 w-7 text-[#bfe4f5] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#f0f5f2] md:text-base lg:text-lg xl:text-xl">1,000기억</h3>
                </div>
                <div className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]">
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack1000Price)}원</p>
                </div>
              </button>
            </div>

            <div className="relative flex justify-center pt-1.5 lg:pt-2">
              <button
                type="button"
                className="relative flex w-[108px] cursor-pointer flex-col items-center text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                {memoryPack20000Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack20000Discount}%
                  </span>
                ) : null}
                <div className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#38403b] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]">
                  <MemoryMark className="h-7 w-7 text-[#bfe4f5] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#f0f5f2] md:text-base lg:text-lg xl:text-xl">20,000기억</h3>
                </div>
                <div className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]">
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack20000Price)}원</p>
                </div>
              </button>
            </div>
          </div>
        </section>

        <div className="mt-12 border-t border-white/10" />

        <section className="mt-16 space-y-6 text-xs leading-relaxed text-[#8d9690] md:text-sm">
          <div>
            <p className="mb-2 font-semibold text-[#aeb8b2]">환불정책</p>
            <p>· 결제 후 사용 이력이 없는 경우에 한해, 결제일 기준 7일 이내 환불을 요청할 수 있습니다.</p>
            <p>· 기억 충전 상품은 디지털 재화 특성상 일부라도 사용된 경우 환불이 제한될 수 있습니다.</p>
            <p>· 무제한 이용권은 활성화 후 이용 시간이 시작되면 환불이 제한됩니다.</p>
            <p>· 중복 결제 또는 시스템 오류 결제는 확인 후 전액 환불 처리됩니다.</p>
          </div>
          <div>
            <p className="mb-2 font-semibold text-[#aeb8b2]">구독 및 무제한 이용 정책</p>
            <p>· 기억 패스는 월 단위 정기 구독 상품이며, 갱신 시 월 기억이 자동 지급됩니다.</p>
            <p>· 구독 해지 시 다음 결제일부터 자동 갱신이 중단되며, 이미 결제된 기간은 만료일까지 이용 가능합니다.</p>
            <p>· 무제한 이용권은 결제 시점부터 24시간 동안 채팅 이용량 제한 없이 사용 가능합니다.</p>
            <p>· 서비스 안정성 및 정책 위반 방지를 위해 비정상 사용이 감지되면 이용이 제한될 수 있습니다.</p>
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
