"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

export default function FadeIn({
    children,
    delay = 2800,
    disableAnimation = false,
}: {
    children: React.ReactNode;
    delay?: number;
    disableAnimation?: boolean;
}) {
    const [show, setShow] = useState(disableAnimation);

    useEffect(() => {
        const shouldDisable = disableAnimation || Capacitor.isNativePlatform();
        if (shouldDisable) {
            setShow(true);
            return;
        }
        const timer = setTimeout(() => setShow(true), delay);
        return () => clearTimeout(timer);
    }, [delay, disableAnimation]);

    return (
        <div className={`transition-opacity duration-1000 ease-in-out ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {children}
        </div>
    );
}
