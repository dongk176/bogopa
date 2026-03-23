"use client";

import { useEffect, useState } from "react";

export default function FadeIn({ children, delay = 2800 }: { children: React.ReactNode, delay?: number }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setShow(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);

    return (
        <div className={`transition-opacity duration-1000 ease-in-out ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {children}
        </div>
    );
}
