"use client";

import { useEffect, useMemo, useState } from "react";

function formatBlockedUntilKst(raw: string | null) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildWithdrawBlockedMessage(blockedUntil: string | null) {
  const formatted = formatBlockedUntilKst(blockedUntil);
  if (!formatted) {
    return "탈퇴한 계정은 30일 동안 다시 로그인할 수 없습니다.";
  }
  return `탈퇴한 계정은 30일 동안 다시 로그인할 수 없습니다. (${formatted} 이후 가능)`;
}

export default function WithdrawBlockedNoticeOverlay() {
  const [open, setOpen] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("blocked") !== "1") return;
    setBlockedUntil(params.get("until"));
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  const message = useMemo(() => buildWithdrawBlockedMessage(blockedUntil), [blockedUntil]);

  const handleClose = () => {
    setOpen(false);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("blocked");
    url.searchParams.delete("until");
    url.searchParams.delete("provider");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 px-4" onClick={handleClose}>
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white px-5 pb-5 pt-6 text-center shadow-[0_24px_48px_rgba(0,0,0,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="안내 닫기"
          className="absolute right-3 top-3 rounded-full p-2 text-[#6f7873] hover:bg-[#eef2ef] hover:text-[#2f342e]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="font-headline text-xl font-bold tracking-tight text-[#2f342e]">로그인 안내</h2>
        <p className="mt-3 break-keep text-sm font-semibold leading-relaxed text-[#5e6662]">{message}</p>
        <button
          type="button"
          onClick={handleClose}
          className="mt-5 w-full rounded-2xl bg-[#4a626d] px-4 py-3 text-sm font-bold text-[#f0f9ff] hover:bg-[#3e5661]"
        >
          확인
        </button>
      </div>
    </div>
  );
}
