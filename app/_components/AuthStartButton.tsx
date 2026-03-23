"use client";

import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

import LoginModal from "./LoginModal";

export function StartChatButtonDesktop() {
    const { data: session, status } = useSession();
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (status === "loading") {
        return <div className="h-[68px] w-[220px] animate-pulse rounded-full bg-[#afb3ac]/20 hidden md:block" />;
    }

    if (session) {
        return (
            <Link
                href="/step-1"
                className="group relative hidden overflow-hidden rounded-full bg-gradient-to-r from-[#3e5560] to-[#4a626d] px-10 py-4 text-lg font-bold text-[#f0f9ff] shadow-[0_8px_20px_rgba(74,98,109,0.25)] transition-all duration-500 hover:shadow-[0_15px_30px_rgba(74,98,109,0.45)] hover:-translate-y-1 hover:scale-105 active:scale-[0.98] md:inline-flex cursor-pointer"
            >
                <span className="relative z-10 tracking-wide">대화 시작하기</span>
                <span className="absolute inset-0 z-0 h-full w-full bg-gradient-to-tr from-transparent via-white/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </Link>
        );
    }

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="group relative hidden overflow-hidden rounded-full bg-gradient-to-r from-[#3e5560] to-[#4a626d] px-10 py-4 text-lg font-bold text-[#f0f9ff] shadow-[0_8px_20px_rgba(74,98,109,0.25)] transition-all duration-500 hover:shadow-[0_15px_30px_rgba(74,98,109,0.45)] hover:-translate-y-1 hover:scale-105 active:scale-[0.98] md:inline-flex cursor-pointer"
            >
                <span className="relative z-10 tracking-wide">대화 시작하기</span>
                <span className="absolute inset-0 z-0 h-full w-full bg-gradient-to-tr from-transparent via-white/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </button>
            <LoginModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </>
    );
}

export function StartChatButtonMobile() {
    const { data: session, status } = useSession();
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (status === "loading") {
        return (
            <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] h-[56px] animate-pulse rounded-full bg-[#afb3ac]/20 md:hidden" />
        );
    }

    if (session) {
        return (
            <Link
                href="/step-1"
                className="group fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] overflow-hidden rounded-full bg-gradient-to-r from-[#3e5560] to-[#4a626d] px-6 py-4 text-center text-base font-bold text-[#f0f9ff] shadow-[0_12px_30px_rgba(74,98,109,0.35)] transition-all duration-500 hover:shadow-[0_20px_40px_rgba(74,98,109,0.5)] hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98] md:hidden cursor-pointer"
            >
                <span className="relative z-10 tracking-wide">대화 시작하기</span>
                <span className="absolute inset-0 z-0 h-full w-full bg-gradient-to-tr from-transparent via-white/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </Link>
        );
    }

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="group fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] overflow-hidden rounded-full bg-gradient-to-r from-[#3e5560] to-[#4a626d] px-6 py-4 text-center text-base font-bold tracking-wide text-[#f0f9ff] shadow-[0_12px_30px_rgba(74,98,109,0.35)] transition-all duration-500 hover:shadow-[0_20px_40px_rgba(74,98,109,0.5)] hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98] md:hidden cursor-pointer"
            >
                <span className="relative z-10">대화 시작하기</span>
                <span className="absolute inset-0 z-0 h-full w-full bg-gradient-to-tr from-transparent via-white/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </button>
            <LoginModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </>
    );
}
