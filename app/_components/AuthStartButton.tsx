"use client";

import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

export function StartChatButtonDesktop() {
    const { data: session } = useSession();

    const handleClick = (e: React.MouseEvent) => {
        if (!session) {
            e.preventDefault();
            signIn("kakao", { callbackUrl: "/step-1" });
        }
    };

    return (
        <Link
            onClick={handleClick}
            className="group relative hidden rounded-full bg-[#4a626d] px-10 py-4 text-lg font-semibold text-[#f0f9ff] shadow-sm transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] md:inline-flex cursor-pointer"
            href="/step-1"
        >
            대화 시작하기
            <span className="absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
    );
}

export function StartChatButtonMobile() {
    const { data: session } = useSession();

    const handleClick = (e: React.MouseEvent) => {
        if (!session) {
            e.preventDefault();
            signIn("kakao", { callbackUrl: "/step-1" });
        }
    };

    return (
        <Link
            onClick={handleClick}
            href="/step-1"
            className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] rounded-full bg-[#4a626d] px-6 py-4 text-center text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] md:hidden cursor-pointer"
        >
            대화 시작하기
        </Link>
    );
}
