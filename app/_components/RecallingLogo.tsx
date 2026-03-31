"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

export default function RecallingLogo({
  children,
  delay = 600,
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
    <div 
      className={`transition-all duration-[2500ms] cubic-bezier(0.22, 1, 0.36, 1) ${
        show 
          ? 'opacity-100 blur-0 scale-100 translate-y-0' 
          : 'opacity-0 blur-[30px] scale-[0.85] -translate-y-8'
      }`}
    >
      {children}
    </div>
  );
}
