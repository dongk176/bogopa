"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Navigation from "@/app/_components/Navigation";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";
import { getEmailDisplay } from "@/lib/display-email";
import {
  AI_DATA_TRANSFER_CONSENT_VERSION,
  AI_DATA_TRANSFER_PROVIDER_NAME,
} from "@/lib/ai-consent";

type ProfilePayload = {
  ok?: boolean;
  profile?: {
    provider?: string | null;
    name?: string;
    birthDate?: string | null;
    gender?: string | null;
    mbti?: string | null;
    interests?: string[];
    aiDataTransferConsented?: boolean;
    aiDataTransferConsentedAt?: string | null;
    aiDataTransferConsentVersion?: string | null;
  };
  error?: string;
};

type AiConsentPayload = {
  ok?: boolean;
  consent?: {
    consented?: boolean;
    consentedAt?: string | null;
    consentVersion?: string | null;
  };
  error?: string;
};

const REQUIRED_WITHDRAW_TEXT = "탈퇴하기";

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

function providerLabel(provider: string | null | undefined) {
  if (!provider) return "연결 정보 없음";
  if (provider === "kakao") return "카카오 로그인";
  if (provider === "google") return "구글 로그인";
  if (provider === "apple") return "Apple 로그인";
  if (provider === "mobile-token") return "모바일 토큰 로그인";
  if (provider === "local-password") return "아이디/비밀번호 로그인";
  return `${provider} 로그인`;
}

function SettingLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#303733] px-5 py-4 transition-colors hover:bg-[#353d39]"
    >
      <div>
        <p className="text-sm font-extrabold text-[#f0f5f2]">{title}</p>
        <p className="mt-1 text-xs text-[#b9cad1]">{description}</p>
      </div>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#9ab3bf]" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

export default function AccountSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [provider, setProvider] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isAiConsentGranted, setIsAiConsentGranted] = useState(false);
  const [aiConsentAt, setAiConsentAt] = useState<string | null>(null);
  const [aiConsentVersion, setAiConsentVersion] = useState<string | null>(null);
  const [isAiConsentSaving, setIsAiConsentSaving] = useState(false);
  const [aiConsentError, setAiConsentError] = useState("");
  const [isWithdrawConsentModalOpen, setIsWithdrawConsentModalOpen] = useState(false);

  useNativeSwipeBack(() => {
    router.push("/profile");
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/user/profile", { cache: "no-store" });
        const payload = (await response.json()) as ProfilePayload;
        if (cancelled) return;
        if (response.ok && payload.ok) {
          setProvider(payload.profile?.provider || null);
          setIsAiConsentGranted(Boolean(payload.profile?.aiDataTransferConsented));
          setAiConsentAt(payload.profile?.aiDataTransferConsentedAt || null);
          setAiConsentVersion(payload.profile?.aiDataTransferConsentVersion || null);
        }
      } catch {
        if (!cancelled) setProvider(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const upsertAiConsent = async (agreed: boolean) => {
    if (isAiConsentSaving) return;
    setIsAiConsentSaving(true);
    setAiConsentError("");

    try {
      const response = await fetch("/api/user/ai-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreed }),
      });
      const payload = (await response.json().catch(() => ({}))) as AiConsentPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "동의 상태 저장에 실패했습니다.");
      }
      const consented = Boolean(payload.consent?.consented);
      setIsAiConsentGranted(consented);
      setAiConsentAt(payload.consent?.consentedAt || null);
      setAiConsentVersion(payload.consent?.consentVersion || null);
    } catch (error) {
      setAiConsentError(error instanceof Error ? error.message : "동의 상태 저장 중 오류가 발생했습니다.");
    } finally {
      setIsAiConsentSaving(false);
    }
  };

  const canSubmitDelete = deleteConfirmText.trim() === REQUIRED_WITHDRAW_TEXT && !isDeletingAccount;

  const handleDeleteAccount = async () => {
    if (!canSubmitDelete) return;

    setIsDeletingAccount(true);
    setDeleteError("");

    try {
      const response = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: deleteConfirmText.trim() }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "회원탈퇴 처리에 실패했습니다.");
      }

      if (typeof window !== "undefined") {
        const keysToDelete = [
          "bogopa_profile_step1",
          "bogopa_profile_step2",
          "bogopa_profile_step3",
          "bogopa_profile_step4",
          "bogopa_onboarding_session_id",
          "bogopa_letters_settings_v1",
          "blueme_persona_analysis",
          "blueme_persona_runtime",
        ];

        keysToDelete.forEach((key) => window.localStorage.removeItem(key));

        const prefixedKeys = [
          "bogopa_chat_state:",
          "blueme_persona_analysis_",
          "blueme_persona_runtime_",
        ];

        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
          const key = window.localStorage.key(index);
          if (!key) continue;
          if (prefixedKeys.some((prefix) => key.startsWith(prefix))) {
            window.localStorage.removeItem(key);
          }
        }
      }

      await signOut({ callbackUrl: "/" });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "회원탈퇴 처리 중 오류가 발생했습니다.");
      setIsDeletingAccount(false);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#242926]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7fa4b6] border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;
  const emailDisplay = getEmailDisplay(session.user?.email);

  return (
    <div className="min-h-screen bg-[#242926] text-[#f0f5f2]">
      <Navigation />

      <nav className="fixed top-0 left-0 z-30 w-full border-b border-white/5 bg-[#242926]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="relative mx-auto flex h-16 w-full items-center px-3 md:px-4 lg:px-10">
          <Link
            href="/profile"
            className="inline-flex items-center justify-center rounded-xl p-2 text-[#afb3ac] transition-colors hover:bg-white/5 hover:text-[#f0f9ff]"
            aria-label="뒤로가기"
          >
            <ArrowLeftIcon />
          </Link>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-headline text-lg font-bold tracking-tight text-[#f0f9ff]">
            계정 정보 및 설정
          </h1>
        </div>
      </nav>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-4xl px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[calc(6.75rem+env(safe-area-inset-top))] md:px-6 lg:pt-24">
          <section className="rounded-2xl border border-white/10 bg-[#303733] px-5 py-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#3e5560]">로그인 정보</p>
            <p className="mt-2 text-sm font-bold text-[#f0f5f2]">{providerLabel(provider)}</p>
            <p className="mt-1 text-xs text-[#c7d6dd]">{emailDisplay.primary}</p>
            {emailDisplay.secondary ? (
              <p className="mt-1 text-[11px] text-[#9fb2bc]">{emailDisplay.secondary}</p>
            ) : null}
          </section>

          <section className="mt-4 space-y-3">
            <SettingLink href="/legal/terms" title="서비스 이용약관" description="서비스 이용 조건과 정책을 확인합니다." />
            <SettingLink href="/legal/privacy" title="개인정보 처리방침" description="개인정보 수집·이용 및 보호 정책을 확인합니다." />
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-[#303733] px-5 py-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#3e5560]">AI 데이터 전송 동의</p>
            <p className="mt-2 text-sm font-bold text-[#f0f5f2]">
              상태: {isAiConsentGranted ? "동의함" : "동의 안 함"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#c7d6dd]">
              대화 기능 제공을 위해 입력한 메시지/맥락 일부가 {AI_DATA_TRANSFER_PROVIDER_NAME}로 전송됩니다.
            </p>
            <p className="mt-1 text-[11px] text-[#9fb2bc]">
              {isAiConsentGranted
                ? `동의 버전: ${aiConsentVersion || AI_DATA_TRANSFER_CONSENT_VERSION}${aiConsentAt ? ` · 동의 시각: ${new Date(aiConsentAt).toLocaleString("ko-KR")}` : ""}`
                : "동의를 철회하면 AI 대화/편지 생성 기능이 즉시 제한됩니다."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isAiConsentGranted ? (
                <button
                  type="button"
                  onClick={() => setIsWithdrawConsentModalOpen(true)}
                  disabled={isAiConsentSaving}
                  className="rounded-xl border border-[#c9a4a2] bg-white px-3 py-2 text-xs font-bold text-[#9f403d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAiConsentSaving ? "처리 중..." : "동의 철회"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void upsertAiConsent(true);
                  }}
                  disabled={isAiConsentSaving}
                  className="rounded-xl bg-[#3e5560] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAiConsentSaving ? "처리 중..." : "다시 동의"}
                </button>
              )}
              <Link
                href="/legal/privacy"
                className="rounded-xl border border-[#b6c4cb] bg-white px-3 py-2 text-xs font-semibold text-[#2f342e]"
              >
                정책 보기
              </Link>
            </div>
            {aiConsentError ? (
              <p className="mt-3 text-xs font-bold text-[#ffb4af]">{aiConsentError}</p>
            ) : null}
          </section>

          <section className="mt-8">
            <button
              type="button"
              onClick={() => {
                setDeleteError("");
                setDeleteConfirmText("");
                setIsDeleteModalOpen(true);
              }}
              className="inline-flex items-center px-1 py-1 text-sm font-extrabold text-[#9f403d] transition-colors hover:text-[#8f3936]"
            >
              탈퇴하기
            </button>
          </section>
        </div>
      </main>

      {isDeleteModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-[2rem] border border-[#d3dbe0] bg-white p-6 shadow-2xl">
            <h3 className="font-headline text-xl font-bold text-[#2f342e]">회원탈퇴</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#4f5b63]">
              탈퇴하면 내 기억, 대화, 출석, 결제카드 등 계정 데이터가 즉시 삭제되며 복구할 수 없습니다.
            </p>
            <p className="mt-2 text-sm font-bold text-[#9f403d]">
              최종 확인: 아래에 <span className="font-extrabold text-[#8c3431]">{REQUIRED_WITHDRAW_TEXT}</span> 를 그대로 입력하세요.
            </p>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder={REQUIRED_WITHDRAW_TEXT}
              className="mt-4 w-full rounded-xl border border-[#b9c4cb] bg-white px-4 py-3 text-sm font-bold text-[#2f342e] placeholder:text-[#8b98a2] focus:outline-none focus:ring-2 focus:ring-[#3e5560]/35"
              autoFocus
            />

            {deleteError ? <p className="mt-3 text-sm font-bold text-[#b42318]">{deleteError}</p> : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isDeletingAccount) return;
                  setIsDeleteModalOpen(false);
                }}
                className="rounded-xl border border-[#c8d1d7] bg-white py-3 text-sm font-bold text-[#2f342e] hover:bg-[#f3f6f8]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={!canSubmitDelete}
                className="rounded-xl bg-[#9f403d] py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isDeletingAccount ? "탈퇴 처리 중..." : "최종 탈퇴"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isWithdrawConsentModalOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm"
          onClick={() => {
            if (isAiConsentSaving) return;
            setIsWithdrawConsentModalOpen(false);
          }}
        >
          <section
            className="w-full max-w-md rounded-[2rem] border border-[#d3dbe0] bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-headline text-xl font-bold text-[#2f342e]">AI 데이터 전송 동의 철회</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#4f5b63]">
              동의를 철회하면 AI 대화와 편지 생성이 즉시 제한됩니다.
              <br />
              다시 이용하려면 설정에서 재동의가 필요합니다.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsWithdrawConsentModalOpen(false)}
                disabled={isAiConsentSaving}
                className="rounded-xl border border-[#c8d1d7] bg-white py-3 text-sm font-bold text-[#2f342e] hover:bg-[#f3f6f8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void upsertAiConsent(false);
                  setIsWithdrawConsentModalOpen(false);
                }}
                disabled={isAiConsentSaving}
                className="rounded-xl bg-[#9f403d] py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isAiConsentSaving ? "처리 중..." : "철회하기"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
