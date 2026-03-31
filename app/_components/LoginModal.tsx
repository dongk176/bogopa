"use client";

import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useEffect } from "react";

type LoginModalProps = {
    isOpen: boolean;
    onClose: () => void;
    nextPath?: string;
};

function normalizeNextPath(nextPath?: string) {
    if (!nextPath || !nextPath.startsWith("/")) return "/step-1";
    if (nextPath.startsWith("/api/")) return "/step-1";
    if (nextPath.startsWith("/auth/")) return "/step-1";
    if (nextPath.startsWith("/signup")) return "/step-1";
    return nextPath;
}

export default function LoginModal({ isOpen, onClose, nextPath }: LoginModalProps) {
    const safeNextPath = normalizeNextPath(nextPath);

    useEffect(() => {
        if (!isOpen) return;

        const { body, documentElement } = document;
        const previousBodyOverflow = body.style.overflow;
        const previousHtmlOverflow = documentElement.style.overflow;
        const previousBodyTouchAction = body.style.touchAction;

        body.style.overflow = "hidden";
        documentElement.style.overflow = "hidden";
        body.style.touchAction = "none";

        return () => {
            body.style.overflow = previousBodyOverflow;
            documentElement.style.overflow = previousHtmlOverflow;
            body.style.touchAction = previousBodyTouchAction;
        };
    }, [isOpen]);

    if (!isOpen) return null;
    const callbackUrl = `/auth/entry?next=${encodeURIComponent(safeNextPath)}`;

    const openNativeLogin = async (provider: "kakao" | "google" | "apple") => {
        if (!Capacitor.isNativePlatform()) return;

        const startUrl = `${window.location.origin}/auth/mobile/start?provider=${provider}&next=${encodeURIComponent(safeNextPath)}`;
        onClose();
        await Browser.open({
            url: startUrl,
            windowName: "_self",
        });
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md px-4 transition-all"
            onClick={onClose}
        >
            <div
                className="relative flex w-full max-w-sm flex-col gap-6 rounded-[2.5rem] border border-[#d9dfdc] bg-white p-8 px-6 pb-10 pt-8 text-center shadow-[0_20px_60px_rgba(20,26,22,0.22)] animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute right-5 top-5 rounded-full p-2 text-[#6f7873] transition-colors hover:bg-[#eef2ef] hover:text-[#2f342e]"
                >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="flex flex-col gap-2 pt-2">
                    <h2 className="font-headline text-2xl font-bold tracking-tight text-[#2f342e]">시작하기</h2>
                    <p className="text-sm font-medium text-[#66706b]">Bogopa와 함께 소중한 대화를 이어가세요.</p>
                </div>

                <div className="flex flex-col gap-3 mt-1">
                    {/* Kakao Button */}
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            if (Capacitor.isNativePlatform()) {
                                void openNativeLogin("kakao");
                                return;
                            }
                            void signIn("kakao", { callbackUrl });
                        }}
                        className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-[#FEE500] px-6 py-4 text-[15px] font-bold text-[#191919] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(254,229,0,0.25)] hover:brightness-105 active:scale-[0.98]"
                    >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                            <path d="M12 4C6.47 4 2 7.57 2 11.97c0 2.85 1.83 5.35 4.6 6.74-.2.72-1.2 4.41-1.2 4.41s-.04.28.14.38c.18.09.4.03.4.03s4.62-3 5.34-3.5c.23.03.48.06.72.06 5.53 0 10-3.57 10-7.97S17.53 4 12 4z" />
                        </svg>
                        카카오톡으로 시작
                    </button>

                    {/* Apple Button */}
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            if (Capacitor.isNativePlatform()) {
                                void openNativeLogin("apple");
                                return;
                            }
                            void signIn("apple", { callbackUrl });
                        }}
                        className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-[#111111] px-6 py-4 text-[15px] font-bold text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:bg-black hover:shadow-[0_8px_20px_rgba(0,0,0,0.2)] active:scale-[0.98]"
                    >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                            <path d="M16.37 12.22c.02 2.16 1.9 2.88 1.92 2.89-.02.05-.3 1.03-.99 2.04-.6.87-1.23 1.74-2.21 1.76-.96.02-1.27-.57-2.37-.57-1.1 0-1.44.55-2.35.59-.95.04-1.67-.95-2.28-1.82-1.24-1.8-2.18-5.1-.91-7.31.64-1.1 1.78-1.8 3.02-1.82.94-.02 1.83.64 2.37.64.54 0 1.56-.79 2.63-.68.45.02 1.7.18 2.5 1.34-.06.04-1.49.87-1.47 2.94zM14.9 6.72c.5-.61.83-1.45.74-2.3-.72.03-1.59.48-2.1 1.09-.46.53-.86 1.39-.75 2.21.81.06 1.63-.41 2.11-1z" />
                        </svg>
                        Apple로 시작
                    </button>

                    {/* Google Button */}
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            if (Capacitor.isNativePlatform()) {
                                void openNativeLogin("google");
                                return;
                            }
                            void signIn("google", { callbackUrl });
                        }}
                        className="group relative flex w-full items-center justify-center gap-3 rounded-2xl border border-[#d7ddda] bg-[#f6f8f7] px-6 py-4 text-[15px] font-bold text-[#2f342e] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:bg-[#eef2ef] hover:shadow-[0_8px_20px_rgba(32,42,35,0.08)] active:scale-[0.98]"
                    >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Google로 시작
                    </button>
                </div>

                <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#6f7873]">
                    시작하시면 Bogopa의 <Link href="/legal/terms" className="underline transition-colors hover:text-[#2f342e]">이용약관</Link> 및 <Link href="/legal/privacy" className="underline transition-colors hover:text-[#2f342e]">개인정보 처리방침</Link>에 동의해주시는 것으로 알고, 소중한 추억을 따뜻하고 안전하게 모실게요.
                </p>
            </div>
        </div>
    );
}
