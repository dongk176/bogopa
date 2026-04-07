"use client";

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NativeAppleAuth } from "@/lib/native-apple-auth";
import WithdrawBlockedNoticeOverlay from "@/app/_components/WithdrawBlockedNoticeOverlay";

export default function NativeAppLoginScreen() {
  const router = useRouter();
  const callbackUrl = "/auth/entry?next=%2F";
  const [isAppleSigningIn, setIsAppleSigningIn] = useState(false);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyTouchAction = body.style.touchAction;
    const prevHtmlTouchAction = html.style.touchAction;
    const lockClassName = "native-lock-scroll";

    body.classList.add(lockClassName);
    html.classList.add(lockClassName);
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    body.style.touchAction = "manipulation";
    html.style.touchAction = "manipulation";

    return () => {
      body.classList.remove(lockClassName);
      html.classList.remove(lockClassName);
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
      body.style.touchAction = prevBodyTouchAction;
      html.style.touchAction = prevHtmlTouchAction;
    };
  }, []);

  const openNativeLogin = async (provider: "kakao" | "google" | "apple") => {
    if (!Capacitor.isNativePlatform()) return;

    const startUrl = `${window.location.origin}/auth/mobile/start?provider=${provider}&next=%2F`;
    try {
      await Browser.open({
        url: startUrl,
        presentationStyle: "fullscreen",
      });
    } catch (error) {
      console.error("[native-login] failed to open provider start page", error);
      window.alert("로그인 화면을 여는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const signInWithNativeApple = async () => {
    if (isAppleSigningIn) return;

    const isNativePlatform = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform();

    if (!isNativePlatform) {
      await signIn("apple", { callbackUrl });
      return;
    }
    if (platform !== "ios") {
      window.alert("Apple 로그인은 iOS 앱에서만 지원됩니다.");
      return;
    }

    try {
      setIsAppleSigningIn(true);
      const credential = await NativeAppleAuth.signIn({ state: "bogopa-native-apple" });
      const response = await fetch("/api/auth/native-apple", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          identityToken: credential.identityToken,
          authorizationCode: credential.authorizationCode,
          userIdentifier: credential.userIdentifier,
          email: credential.email,
          givenName: credential.givenName,
          familyName: credential.familyName,
          nextPath: "/",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        token?: string;
        nextPath?: string;
        error?: string;
      };
      const transferToken = typeof payload.token === "string" ? payload.token.trim() : "";
      const nextPath = typeof payload.nextPath === "string" && payload.nextPath.startsWith("/") ? payload.nextPath : "/";

      if (!response.ok || !transferToken) {
        throw new Error(payload.error || "Native Apple login transfer failed");
      }

      const result = await signIn("mobile-token", {
        token: transferToken,
        redirect: false,
        callbackUrl: nextPath,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      router.replace(nextPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("취소") || /cancel/i.test(errorMessage)) {
        return;
      }
      if (errorMessage.includes("진행 중")) {
        window.alert("Apple 로그인 요청이 아직 처리 중입니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      console.error("[native-apple-login] failed", error);
      window.alert(errorMessage || "Apple 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsAppleSigningIn(false);
    }
  };

  return (
    <div className="fixed inset-0 h-dvh overflow-hidden bg-white px-6 pb-[calc(2rem+var(--native-safe-bottom))] pt-[calc(2rem+var(--native-safe-top))] text-[#2f342e]">
      <WithdrawBlockedNoticeOverlay />
      <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center">
        <img src="/logo/bogopa%20logo.png" alt="Bogopa 로고" className="mb-6 h-32 w-32 object-contain" />

        <h1 className="text-center font-headline text-[2rem] font-extrabold leading-[1.2] tracking-tight">
          기억이 있다면,
          <br />
          <span className="text-[#4a626d]">다시 만날 수 있습니다</span>
        </h1>

        <div className="mt-10 flex w-full flex-col gap-3">
          <a
            href="/auth/mobile/start?provider=kakao&next=%2F"
            onClick={(event) => {
              if (Capacitor.isNativePlatform()) {
                event.preventDefault();
                void openNativeLogin("kakao");
                return;
              }
              event.preventDefault();
              void signIn("kakao", { callbackUrl });
            }}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#FEE500] px-6 py-4 text-[15px] font-bold text-[#191919]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 4C6.47 4 2 7.57 2 11.97c0 2.85 1.83 5.35 4.6 6.74-.2.72-1.2 4.41-1.2 4.41s-.04.28.14.38c.18.09.4.03.4.03s4.62-3 5.34-3.5c.23.03.48.06.72.06 5.53 0 10-3.57 10-7.97S17.53 4 12 4z" />
            </svg>
            카카오톡으로 로그인
          </a>

          <a
            href="/auth/mobile/start?provider=google&next=%2F"
            onClick={(event) => {
              if (Capacitor.isNativePlatform()) {
                event.preventDefault();
                void openNativeLogin("google");
                return;
              }
              event.preventDefault();
              void signIn("google", { callbackUrl });
            }}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[#d7ddda] bg-[#f6f8f7] px-6 py-4 text-[15px] font-bold text-[#2f342e]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google로 로그인
          </a>

          <a
            href="/auth/mobile/start?provider=apple&next=%2F"
            onClick={(event) => {
              if (isAppleSigningIn) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              void signInWithNativeApple();
            }}
            aria-disabled={isAppleSigningIn}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#111111] px-6 py-4 text-[15px] font-bold text-[#ffffff] aria-disabled:opacity-60"
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                <path d="M16.37 12.22c.02 2.16 1.9 2.88 1.92 2.89-.02.05-.3 1.03-.99 2.04-.6.87-1.23 1.74-2.21 1.76-.96.02-1.27-.57-2.37-.57-1.1 0-1.44.55-2.35.59-.95.04-1.67-.95-2.28-1.82-1.24-1.8-2.18-5.1-.91-7.31.64-1.1 1.78-1.8 3.02-1.82.94-.02 1.83.64 2.37.64.54 0 1.56-.79 2.63-.68.45.02 1.7.18 2.5 1.34-.06.04-1.49.87-1.47 2.94zM14.9 6.72c.5-.61.83-1.45.74-2.3-.72.03-1.59.48-2.1 1.09-.46.53-.86 1.39-.75 2.21.81.06 1.63-.41 2.11-1z" />
              </svg>
            </span>
            <span className="leading-none text-[#ffffff]">
              {isAppleSigningIn ? "Apple 로그인 중..." : "Apple로 로그인"}
            </span>
          </a>
        </div>

        <a
          href="/login"
          className="mt-5 text-sm font-semibold text-[#4a626d] underline underline-offset-4"
        >
          아이디 비밀번호로 로그인
        </a>
      </div>
    </div>
  );
}
