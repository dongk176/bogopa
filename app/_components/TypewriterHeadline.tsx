"use client";

import { Capacitor } from "@capacitor/core";
import { useState, useEffect } from "react";

export default function TypewriterHeadline({ disableAnimation = false }: { disableAnimation?: boolean }) {
    const line1 = "내 기억으로";
    const line2 = "시작되는 대화";

    const [runtimeDisable, setRuntimeDisable] = useState(disableAnimation);
    const [text1, setText1] = useState(disableAnimation ? line1 : "");
    const [text2, setText2] = useState(disableAnimation ? line2 : "");
    const [showCursor1, setShowCursor1] = useState(!disableAnimation);
    const [showCursor2, setShowCursor2] = useState(false);
    const [isIntro, setIsIntro] = useState(!disableAnimation);

    useEffect(() => {
        const nativeRuntime = Capacitor.isNativePlatform();
        const shouldDisable = disableAnimation || nativeRuntime;
        setRuntimeDisable(shouldDisable);

        if (shouldDisable) {
            setText1(line1);
            setText2(line2);
            setShowCursor1(false);
            setShowCursor2(false);
            setIsIntro(false);
            document.body.style.overflow = "";
            return;
        }

        // 스크롤 잠금 및 최상단 강제 고정
        document.body.style.overflow = "hidden";
        window.scrollTo(0, 0);

        let i = 0;
        let j = 0;
        const typingSpeed = 60; // 속도 상향

        const typeLine1 = () => {
            if (i < line1.length) {
                setText1(line1.substring(0, i + 1));
                i++;
                setTimeout(typeLine1, typingSpeed);
            } else {
                setShowCursor1(false);
                setShowCursor2(true);
                setTimeout(typeLine2, 200);
            }
        };

        const typeLine2 = () => {
            if (j < line2.length) {
                setText2(line2.substring(0, j + 1));
                j++;
                setTimeout(typeLine2, typingSpeed);
            } else {
                setTimeout(() => {
                    setShowCursor2(false);
                    setIsIntro(false);
                    document.body.style.overflow = ""; // 스크롤 잠금 해제
                }, 400);
            }
        };

        const initialDelay = setTimeout(typeLine1, 0);

        return () => {
            clearTimeout(initialDelay);
            document.body.style.overflow = ""; // 언마운트 시 항상 해제
        };
    }, [disableAnimation]);

    return (
        <div
            className={`${runtimeDisable ? "relative z-10" : "transition-all duration-[1200ms] ease-in-out relative z-10"} ${isIntro && !runtimeDisable ? 'translate-y-[28vh] md:translate-y-[32vh] scale-[1.15]' : 'translate-y-0 scale-100'
                }`}
        >
            <h1 className="font-headline mb-5 text-3xl leading-[1.1] font-extrabold tracking-tight text-[#2f342e] md:mb-8 md:text-5xl">
                <span className="inline-block relative">
                    <span suppressHydrationWarning className="opacity-0 pointer-events-none select-none">{line1}</span>
                    <span className="absolute left-0 top-0 whitespace-nowrap text-left">
                        {text1}
                        <span className={`transition-opacity duration-200 ml-0.5 font-light opacity-80 ${showCursor1 ? 'animate-pulse' : 'hidden'}`}>|</span>
                    </span>
                </span>
                <br />
                <span className="text-[#4a626d] inline-block relative">
                    <span suppressHydrationWarning className="opacity-0 pointer-events-none select-none">{line2}</span>
                    <span className="absolute left-0 top-0 whitespace-nowrap text-left">
                        {text2}
                        <span className={`transition-opacity duration-200 ml-0.5 font-light opacity-80 ${showCursor2 ? 'animate-pulse' : 'hidden'}`}>|</span>
                    </span>
                </span>
            </h1>
        </div>
    );
}
