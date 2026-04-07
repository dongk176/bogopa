"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";

function formatBlockedUntilKst(raw: string | null | undefined) {
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

function buildWithdrawBlockedMessage(blockedUntil: string | null | undefined) {
  const formatted = formatBlockedUntilKst(blockedUntil);
  if (!formatted) {
    return "탈퇴한 계정은 30일 동안 다시 로그인할 수 없습니다.";
  }
  return `탈퇴한 계정은 30일 동안 다시 로그인할 수 없습니다. (${formatted} 이후 가능)`;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  useNativeSwipeBack(() => router.back(), { startMode: "content" });

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const lockClassName = "native-lock-scroll";
    const prevBodyTouchAction = body.style.touchAction;
    const prevHtmlTouchAction = html.style.touchAction;

    body.classList.add(lockClassName);
    html.classList.add(lockClassName);
    body.style.touchAction = "manipulation";
    html.style.touchAction = "manipulation";

    return () => {
      body.classList.remove(lockClassName);
      html.classList.remove(lockClassName);
      body.style.touchAction = prevBodyTouchAction;
      html.style.touchAction = prevHtmlTouchAction;
    };
  }, []);

  useEffect(() => {
    const blocked = searchParams.get("blocked");
    if (blocked !== "1") return;
    const blockedUntil = searchParams.get("until");
    setError(buildWithdrawBlockedMessage(blockedUntil));
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const normalizedId = userId.trim();
    if (!normalizedId || !password) {
      setError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const statusResponse = await fetch(`/api/auth/local-login-status?userId=${encodeURIComponent(normalizedId)}`, {
        cache: "no-store",
      });
      if (statusResponse.ok) {
        const statusPayload = (await statusResponse.json().catch(() => ({}))) as {
          blocked?: boolean;
          blockedUntil?: string | null;
        };
        if (statusPayload.blocked) {
          setError(buildWithdrawBlockedMessage(statusPayload.blockedUntil));
          setIsSubmitting(false);
          return;
        }
      }
    } catch {
      // ignore pre-check errors and continue sign-in
    }

    const result = await signIn("local-password", {
      redirect: false,
      userId: normalizedId,
      password,
      callbackUrl: "/auth/entry?next=%2F",
    });

    if (!result || result.error) {
      if (typeof result?.error === "string" && result.error.startsWith("ACCOUNT_WITHDRAWN_BLOCKED_UNTIL:")) {
        const blockedUntil = result.error.slice("ACCOUNT_WITHDRAWN_BLOCKED_UNTIL:".length);
        setError(buildWithdrawBlockedMessage(blockedUntil));
      } else {
        setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      }
      setIsSubmitting(false);
      return;
    }

    router.replace("/auth/entry?next=%2F");
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-white px-6 pb-10 pt-[calc(2rem+var(--native-safe-top))] text-[#2f342e]">
      <section className="mx-auto flex w-full max-w-sm flex-col">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 w-fit rounded-xl p-2 text-[#4a626d]"
          aria-label="뒤로가기"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M15 18 9 12l6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <h1 className="font-headline text-3xl font-extrabold tracking-tight">아이디 비밀번호 로그인</h1>
        <p className="mt-2 text-sm text-[#66706b]">계정 정보를 입력하고 계속 진행하세요.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a626d]">아이디</span>
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="아이디"
              className="w-full rounded-2xl border border-[#d6ddd8] bg-white px-4 py-3 text-base outline-none focus:border-[#4a626d]"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a626d]">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              className="w-full rounded-2xl border border-[#d6ddd8] bg-white px-4 py-3 text-base outline-none focus:border-[#4a626d]"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>

          {error ? <p className="text-sm font-semibold text-[#b23a32]">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-2xl bg-[#4a626d] px-4 py-3 text-base font-extrabold text-[#f0f9ff] disabled:opacity-60"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="fixed inset-0 grid place-items-center overflow-hidden bg-white text-[#2f342e]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
