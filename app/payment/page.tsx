"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import type { IapProductKey } from "@/lib/iap/catalog";
import { getIapPriceKrw, MEMORY_PASS_LIST_PRICE_KRW } from "@/lib/iap/pricing";
import Navigation from "@/app/_components/Navigation";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";
import MemoryBalanceBadge from "@/app/_components/MemoryBalanceBadge";
import { purchaseIapProduct } from "@/lib/iap/client";

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
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isPurchasingKey, setIsPurchasingKey] = useState<IapProductKey | null>(null);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const paywallViewLoggedRef = useRef(false);
  const memoryPassPromoPrice = getIapPriceKrw("memory_pass_monthly");
  const memoryPassMonthlyPrice = MEMORY_PASS_LIST_PRICE_KRW;

  const memoryPackBase = getIapPriceKrw("memory_pack_200");
  const memoryPack200Price = getIapPriceKrw("memory_pack_200");
  const memoryPack1000Original = memoryPackBase * 5;
  const memoryPack20000Original = memoryPackBase * 100;
  const memoryPack1000Price = getIapPriceKrw("memory_pack_1000");
  const memoryPack20000Price = getIapPriceKrw("memory_pack_20000");
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
    if (!Capacitor.isNativePlatform()) return;

    void Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});
    void Keyboard.hide().catch(() => {});
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--bogopa-keyboard-height", "0px");
    }
  }, []);

  const trackAnalyticsEvent = async (eventName: "paywall_view" | "paywall_cta_clicked", properties: Record<string, unknown>) => {
    try {
      await fetch("/api/analytics/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ eventName, properties }),
      });
    } catch {
      // no-op
    }
  };

  const refreshMemoryPassStatus = async () => {
    try {
      const response = await fetch("/api/memory-pass", { cache: "no-store" });
      if (!response.ok) return false;
      const data = await response.json().catch(() => ({}));
      setMemoryBalance(Number(data?.memoryBalance ?? 0));
      const nextSubscribed = Boolean(data?.isSubscribed);
      setIsSubscribed(nextSubscribed);
      return nextSubscribed;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/memory-pass", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        setMemoryBalance(Number(data?.memoryBalance ?? 0));
        setIsSubscribed(Boolean(data?.isSubscribed));
      } catch {
        if (!cancelled) {
          setMemoryBalance(null);
          setIsSubscribed(false);
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (paywallViewLoggedRef.current) return;
    paywallViewLoggedRef.current = true;
    void trackAnalyticsEvent("paywall_view", {
      source: "payment_page",
      returnTo,
    });
  }, [returnTo]);

  const startPurchase = async (productKey: IapProductKey) => {
    if (isPurchasingKey) return;
    if (productKey === "memory_pass_monthly" && isSubscribed) return;

    if (productKey === "memory_pass_monthly") {
      const subscribedNow = await refreshMemoryPassStatus();
      if (subscribedNow) {
        setPendingNotice("이미 기억 패스를 이용 중이에요.");
        return;
      }
    }

    void trackAnalyticsEvent("paywall_cta_clicked", {
      source: "payment_page",
      productKey,
      isSubscribed,
    });
    setPendingNotice(null);
    setIsPurchasingKey(productKey);

    try {
      const applied = await purchaseIapProduct(productKey);

      if (typeof applied.memoryBalance === "number") {
        setMemoryBalance(applied.memoryBalance);
      } else {
        await refreshMemoryPassStatus();
      }
      if (typeof applied.isSubscribed === "boolean") {
        setIsSubscribed(applied.isSubscribed);
      } else if (productKey === "memory_pass_monthly") {
        await refreshMemoryPassStatus();
      }

      setPendingNotice("결제가 반영되었습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "결제를 진행하지 못했습니다.";
      setPendingNotice(message);
    } finally {
      setIsPurchasingKey(null);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#2f342e]">
      <Navigation />

      <nav className="fixed top-0 left-0 z-50 w-full border-b border-[#e5ebef] bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="relative mx-auto flex h-16 w-full max-w-screen-2xl items-center px-3 md:px-4 lg:px-10">
          <div>
            <Link
              href={returnTo}
              aria-label="뒤로가기"
              className="inline-flex items-center justify-center rounded-xl p-2 text-[#4a626d] transition-colors hover:bg-[#f2f6f8] hover:text-[#2f342e]"
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

      <main className="mx-auto max-w-7xl px-4 pb-[calc(10.5rem+max(env(safe-area-inset-bottom),0.5rem))] pt-[calc(6rem+env(safe-area-inset-top))] md:px-6 lg:px-10">
        {pendingNotice ? (
          <section className="mb-6 rounded-2xl border border-[#c8d8e2] bg-[#edf5f9] p-3.5">
            <p className="text-sm font-semibold text-[#2f4f5f]">{pendingNotice}</p>
          </section>
        ) : null}

        <div className="mb-20 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <article
            className="payment-memory-pass-card relative overflow-hidden rounded-[2rem] border border-[#b8ceda]/80 p-8 shadow-2xl lg:col-span-7 lg:p-10"
            style={{
              backgroundColor: "#3b5666",
              backgroundImage: "linear-gradient(215deg, #304b5a 0%, #4f6d7d 100%)",
            }}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#9fc2d433] blur-3xl" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-8">
              <div>
                <h2 className="font-headline text-3xl font-bold text-white md:text-4xl">기억 패스</h2>
                <p className="mt-3 text-base font-semibold text-white md:text-lg">말투와 기억을 더 길고 정확하게 반영해요.</p>

                <ul className="mt-8 space-y-3 text-white">
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                    생성 가능한 기억 최대 15개
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                    매달 1,000 기억 자동 지급
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                    하루 최대 10개의 편지 무료 받기
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
                  <p className="text-sm font-semibold text-white/90">첫 달 특가</p>
                  <div className="mt-1 flex items-end gap-3">
                    <p className="text-lg font-semibold text-white/70 line-through">{formatKrw(memoryPassMonthlyPrice)}원</p>
                    <p className="font-headline text-3xl font-bold text-white md:text-4xl">{formatKrw(memoryPassPromoPrice)}원</p>
                  </div>
                  <p className="mt-1 text-sm text-white/90">첫 달 이후 정상가 적용</p>
                </div>
                <button
                  type="button"
                  onClick={() => void startPurchase("memory_pass_monthly")}
                  disabled={isPurchasingKey !== null || isSubscribed}
                  className="inline-flex items-center justify-center rounded-xl border border-white/85 bg-white px-8 py-4 text-lg font-bold text-[#3e5560] shadow-xl shadow-black/20 transition-colors hover:bg-[#f3f8fb] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubscribed ? "구독중" : isPurchasingKey === "memory_pass_monthly" ? "구매 처리중..." : "구독하기"}
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-[#d6e1e8] bg-[#f7fafc] p-8 shadow-xl lg:col-span-5 lg:p-10">
            <h2 className="font-headline text-3xl font-bold text-[#2f342e]">무제한 대화 이용권</h2>
            <p className="mt-3 text-base font-medium text-[#4a626d] md:text-lg">하루 동안 무제한으로 대화를 이어가세요.</p>

            <div className="mt-8 space-y-3">
              <div className="rounded-xl bg-[#eef3f7] p-4">
                <p className="font-bold text-[#2f342e]">24시간, 완전 무제한</p>
                <p className="mt-1 text-sm text-[#5d605a]">사용량 상관 없이 원하는 만큼 대화 가능</p>
              </div>
              <div className="rounded-xl bg-[#eef3f7] p-4">
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
                onClick={() => void startPurchase("unlimited_chat_24h")}
                disabled={isPurchasingKey !== null}
                className="mt-5 w-full rounded-xl bg-[#4a626d] px-6 py-4 font-bold text-white shadow-lg shadow-[#8ba8b833] transition-colors hover:bg-[#3e5661] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPurchasingKey === "unlimited_chat_24h" ? "구매 처리중..." : "구매하기"}
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
                onClick={() => void startPurchase("memory_pack_200")}
                disabled={isPurchasingKey !== null}
                className="relative flex w-[108px] flex-col items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 disabled:cursor-not-allowed disabled:opacity-60 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                {memoryPack200Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack200Discount}%
                  </span>
                ) : null}
                <div
                  className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#f2f7fb] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]"
                >
                  <MemoryMark className="h-7 w-7 text-[#3e5560] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#2f342e] md:text-base lg:text-lg xl:text-xl">200기억</h3>
                </div>
                <div
                  className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]"
                >
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack200Price)}원</p>
                </div>
              </button>
            </div>

            <div className="relative flex justify-center pt-1.5 lg:pt-2">
              <button
                type="button"
                onClick={() => void startPurchase("memory_pack_1000")}
                disabled={isPurchasingKey !== null}
                className="relative z-[1] flex w-[108px] flex-col items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 disabled:cursor-not-allowed disabled:opacity-60 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                <div className="pointer-events-none absolute right-0 top-0 z-0 h-20 w-20 rounded-full bg-[#7fa4b6]/20 blur-2xl" />
                {memoryPack1000Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack1000Discount}%
                  </span>
                ) : null}
                <div
                  className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#f2f7fb] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]"
                >
                  <MemoryMark className="h-7 w-7 text-[#3e5560] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#2f342e] md:text-base lg:text-lg xl:text-xl">1,000기억</h3>
                </div>
                <div
                  className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]"
                >
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack1000Price)}원</p>
                </div>
              </button>
            </div>

            <div className="relative flex justify-center pt-1.5 lg:pt-2">
              <button
                type="button"
                onClick={() => void startPurchase("memory_pack_20000")}
                disabled={isPurchasingKey !== null}
                className="relative flex w-[108px] flex-col items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa4b6]/70 disabled:cursor-not-allowed disabled:opacity-60 md:w-[120px] lg:w-[192px] xl:w-[208px]"
              >
                {memoryPack20000Discount > 0 ? (
                  <span className="absolute -right-2 -top-2 z-20 inline-flex rounded-full bg-[#ff4d4d] px-2.5 py-1.5 text-xs font-extrabold leading-none text-white md:-right-2 md:-top-2 md:px-3.5 md:py-2 md:text-sm lg:-right-3 lg:-top-3 lg:px-4 lg:py-2.5 lg:text-base">
                    {memoryPack20000Discount}%
                  </span>
                ) : null}
                <div
                  className="grid h-[96px] w-full place-items-center rounded-t-[1rem] rounded-b-none border border-[#4a626d]/70 bg-[#f2f7fb] p-2 md:h-[108px] lg:h-[168px] xl:h-[182px]"
                >
                  <MemoryMark className="h-7 w-7 text-[#3e5560] md:h-8 md:w-8 lg:h-10 lg:w-10 xl:h-11 xl:w-11" />
                  <h3 className="w-full text-center font-headline text-sm font-bold tracking-tight whitespace-nowrap text-[#2f342e] md:text-base lg:text-lg xl:text-xl">20,000기억</h3>
                </div>
                <div
                  className="-mt-px flex h-11 w-full items-center justify-center rounded-t-none rounded-b-[0.85rem] border border-[#4a626d]/70 bg-[#4a626d] px-3 md:h-12 lg:h-[68px] xl:h-[72px]"
                >
                  <p className="w-full text-center font-headline text-base font-extrabold leading-tight whitespace-nowrap text-[#f0f9ff] md:text-lg lg:text-xl xl:text-2xl">{formatKrw(memoryPack20000Price)}원</p>
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className="mt-12 overflow-hidden rounded-3xl bg-white">
          <button
            type="button"
            onClick={() => setIsPolicyOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[#f8fbfd] md:px-6"
            aria-expanded={isPolicyOpen}
            aria-controls="payment-policy-content"
          >
            <span className="font-headline text-lg font-extrabold tracking-tight text-[#2f342e]">환불 정책 및 이용 정책</span>
            <svg
              viewBox="0 0 24 24"
              className={`h-5 w-5 text-[#4a626d] transition-transform ${isPolicyOpen ? "rotate-180" : "rotate-0"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {isPolicyOpen ? (
            <div id="payment-policy-content" className="border-t border-[#edf1f4] px-5 pb-5 pt-4 md:px-6 md:pb-6">
              <div className="space-y-4 text-sm leading-7 text-[#4a626d]">
                <div>
                  <p className="font-bold text-[#2f342e]">[유료 상품 및 서비스 이용 정책]</p>
                  <p className="mt-2 font-semibold text-[#2f342e]">1. 유료 상품 안내</p>
                  <p className="mt-1">
                    ① 구독형 프리미엄 서비스 : [기억패스]
                    <br />
                    &#39;기억패스&#39;는 AI와의 더 깊고 풍부한 교감을 위해 제공되는 월 정기결제 구독 상품입니다. 결제 즉시 혜택이 제공되는 디지털 콘텐츠 특성상, 구독
                    혜택 중 일부라도 사용 시 해당 월의 청약철회가 불가합니다.
                    <br />- 매월 &#39;기억&#39; 1,000개 지급 (결제일 기준 매월 갱신)
                    <br />- 무료 편지 혜택 : 하루 최대 10개의 편지를 무료로 수신 가능
                    <br />- 디테일 설정 확장 : &#39;기억 조각&#39; 및 &#39;입버릇&#39; 입력 한도 기본 제공량 대비 10배 확장
                    <br />- 대화 핵심 성향 설정 : AI의 대화 스타일과 성향을 원하는 대로 직접 작성하고 설정
                    <br />- 자동 결제 안내 : 구독은 매월 자동으로 갱신되며, 다음 결제일로부터 최소 24시간 전에 해지하지 않으면 다음 달 요금이 청구됩니다.
                  </p>
                  <p className="mt-3">
                    ② 기간제 무제한 이용권 : [무제한 대화]
                    <br />
                    구매 시점으로부터 24시간 동안 보유한 &#39;기억&#39;의 차감 없이 AI와 대화할 수 있는 기간제 상품입니다. 결제 즉시 시간이 차감되는 타이머 형태의
                    상품이므로, 구매 후 단 한 번이라도 대화를 전송한 경우 환불이 절대 불가합니다.
                  </p>
                  <p className="mt-3">
                    ③ 개별 재화 충전 : [&#39;기억&#39; 단품 구매]
                    <br />
                    필요한 만큼의 &#39;기억&#39;을 추가로 충전할 수 있습니다. (200개 / 1,000개 / 20,000개)
                    <br />
                    재화의 유효기간 : 구매한 &#39;기억&#39;은 별도의 유효기간이 없으나, 본 서비스의 존속 기간 동안에만 사용이 보장됩니다. 계정 탈퇴, 서비스 종료 또는
                    운영 정책 위반으로 인한 계정 영구 정지 시 잔여 기억은 소멸되며 환불되지 않습니다.
                  </p>
                </div>

                <div className="border-t border-[#e3eaef] pt-4">
                  <p className="font-bold text-[#2f342e]">[청약철회 및 환불 정책]</p>
                  <p className="mt-2 font-semibold text-[#2f342e]">1. 환불 신청 기간 및 방법</p>
                  <p className="mt-1">
                    유료 상품 구매일로부터 7일 이내, 상품을 전혀 사용하지 않은 상태에서만 고객센터 이메일(artiroom176@gmail.com)을 통해 청약철회를 요청할 수
                    있습니다.
                  </p>

                  <p className="mt-3 font-semibold text-[#2f342e]">2. 청약철회 및 환불 불가 사유 (필독)</p>
                  <p className="mt-1">
                    전자상거래법 제17조 제2항 및 관련 법령, 본 서비스 운영 기준에 따라 다음의 경우 어떠한 사유로도 청약철회 및 환불이 엄격히 제한됩니다.
                  </p>
                  <p className="mt-2">
                    디지털 콘텐츠의 훼손 및 사용 내역이 있는 경우
                    <br />- 결제 후 지급된 &#39;기억&#39;을 1개라도 소진한 경우
                    <br />- &#39;무제한 대화&#39; 구매 후 AI에게 메시지를 1회 이상 전송한 경우
                    <br />- &#39;기억패스&#39; 구매 후 제공된 &#39;기억&#39; 소진, 편지 수신, &#39;기억 조각/입버릇/핵심 성향&#39; 등 설정 확장 기능을
                    1회라도 열람하거나 세팅한 경우 (패키지 상품의 일부 기능만 사용해도 전체 환불 불가)
                  </p>
                  <p className="mt-3">
                    AI 서비스의 특성 및 주관적 사유
                    <br />- AI 생성 결과물의 품질, 문맥 오인, 사실과 다른 정보 제공(할루시네이션) 등은 기술적 특성일 뿐 상품의 하자가 아니며 환불 사유가 되지
                    않습니다.
                    <br />- 기대했던 대화 흐름이 아니라는 등의 주관적인 불만족이나 단순 변심은 환불 대상이 아닙니다.
                  </p>
                  <p className="mt-3">
                    시스템 및 네트워크 환경
                    <br />- 이용자의 디바이스나 네트워크 문제, 일시적인 서버 지연 및 정기 점검으로 인한 불편은 환불 사유에 해당하지 않습니다.
                  </p>
                  <p className="mt-3">
                    운영 정책 위반으로 인한 제재
                    <br />- 비정상적인 이용(어뷰징), AI를 향한 과도한 욕설 및 성적 발언 등 서비스 운영 정책 위반으로 계정 이용이 제한되거나 강제 탈퇴 처리된 경우,
                    잔여 유료 재화 및 구독 기간은 일절 환불되지 않습니다.
                  </p>
                  <p className="mt-3">
                    무상 지급 재화
                    <br />- 이벤트, 보상 등을 통해 무상으로 지급받은 재화는 환불 대상에서 제외됩니다.
                  </p>

                  <p className="mt-4 font-semibold text-[#2f342e]">3. 환불 처리 안내</p>
                  <p className="mt-1">
                    조건을 충족하는 정당한 환불 요청에 한해, 접수일로부터 영업일 기준 3일 이내에 결제 취소 절차가 진행됩니다. 단, 결제 대행사(PG) 및 앱
                    마켓(앱스토어, 플레이스토어)의 정책에 따라 실제 환급까지는 추가 시일이 소요될 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <div aria-hidden className="h-[calc(2.5rem+env(safe-area-inset-bottom))] lg:hidden" />
      </main>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
