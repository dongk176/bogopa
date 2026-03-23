"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";

export default function UserProfileMenu() {
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!session?.user) return null;

    return (
        <div className="relative ml-2" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-transparent bg-[#1e221d] text-[#faf9f5] transition-transform hover:scale-105 active:scale-95 focus:outline-none shadow-sm"
            >
                {session.user.image ? (
                    <img src={session.user.image} alt="프로필" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#4a626d] text-white font-bold text-sm">
                        {session.user.name?.[0] || "U"}
                    </div>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-[#4a626d]/30 bg-[#2f342e]/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-black/5 focus:outline-none z-[100] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/10">
                        <p className="truncate text-sm font-bold text-[#faf9f5]">
                            {session.user.name || "사용자"}
                        </p>
                        {session.user.email && (
                            <p className="truncate text-[11px] text-[#afb3ac] mt-1 font-medium">
                                {session.user.email}
                            </p>
                        )}
                    </div>

                    <div className="p-1.5">
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            className="group flex w-full items-center rounded-xl px-4 py-2.5 text-sm font-bold text-[#ff6b6b] hover:bg-white/10 active:bg-white/20 transition-colors text-left"
                        >
                            <svg className="mr-3 h-4 w-4 text-[#ff6b6b]/80 group-hover:text-[#ff6b6b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            로그아웃
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
