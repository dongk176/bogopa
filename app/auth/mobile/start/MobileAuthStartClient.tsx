"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

type SupportedProvider = "kakao" | "google" | "apple";

function normalizeProvider(value: string | null): SupportedProvider {
  if (value === "apple") return "apple";
  if (value === "google") return "google";
  return "kakao";
}

function normalizeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) return "/step-1";
  if (nextPath.startsWith("/api/")) return "/step-1";
  if (nextPath.startsWith("/auth/")) return "/step-1";
  if (nextPath.startsWith("/signup")) return "/step-1";
  return nextPath;
}

export default function MobileAuthStartClient() {
  const searchParams = useSearchParams();
  const isStartedRef = useRef(false);

  const provider = useMemo(() => normalizeProvider(searchParams.get("provider")), [searchParams]);
  const nextPath = useMemo(() => normalizeNextPath(searchParams.get("next")), [searchParams]);
  const callbackUrl = useMemo(
    () => `/auth/mobile/complete?provider=${encodeURIComponent(provider)}&next=${encodeURIComponent(nextPath)}`,
    [nextPath, provider],
  );

  useEffect(() => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    void signIn(provider, { callbackUrl });
  }, [callbackUrl, provider]);

  return (
    <div className="max-w-md space-y-3">
      <h1 className="font-headline text-2xl font-bold">로그인 연결 중</h1>
      <p className="text-sm text-[#655d5a]">잠시만 기다려 주세요. 인증 화면으로 이동합니다.</p>
    </div>
  );
}
