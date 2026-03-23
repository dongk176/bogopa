"use client";

import { useState, useEffect } from "react";

export default function TypewriterHeadline() {
    const line1 = "기억을 바탕으로,";
    const line2 = "다시 만나는 대화";

    const [text1, setText1] = useState("");
    const [text2, setText2] = useState("");
    const [showCursor1, setShowCursor1] = useState(true);
    const [showCursor2, setShowCursor2] = useState(false);
    const [isIntro, setIsIntro] = useState(true);

    useEffect(() => {
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
                    setIsIntro(false);
                    document.body.style.overflow = ""; // 스크롤 잠금 해제
                }, 400);
            }
        };

        const initialDelay = setTimeout(typeLine1, 300);

        return () => {
            clearTimeout(initialDelay);
            document.body.style.overflow = ""; // 언마운트 시 항상 해제
        };
    }, []);

    return (
        <div
            className={`transition-all duration-[1200ms] ease-in-out relative z-[100] ${isIntro ? 'translate-y-[28vh] md:translate-y-[32vh] scale-[1.15]' : 'translate-y-0 scale-100'
                }`}
        >
            <h1 className="font-headline mb-5 text-4xl leading-[1.1] font-extrabold tracking-tight text-[#2f342e] md:mb-8 md:text-6xl">
                <span className="inline-block relative">
                    <span className="opacity-0 pointer-events-none select-none">{line1}</span>
                    <span className="absolute left-0 top-0 whitespace-nowrap text-left">
                        {text1}
                        <span className={`transition-opacity duration-200 ml-0.5 font-light opacity-80 ${showCursor1 ? 'animate-pulse' : 'hidden'}`}>|</span>
                    </span>
                </span>
                <br />
                <span className="text-[#4a626d] inline-block relative">
                    <span className="opacity-0 pointer-events-none select-none">{line2}</span>
                    <span className="absolute left-0 top-0 whitespace-nowrap text-left">
                        {text2}
                        <span className={`transition-opacity duration-200 ml-0.5 font-light opacity-80 ${showCursor2 ? 'animate-pulse' : 'hidden'}`}>|</span>
                    </span>
                </span>
            </h1>
        </div>
    );
}
