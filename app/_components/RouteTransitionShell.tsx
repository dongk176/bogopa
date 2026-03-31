"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const TRANSITION_MS = 500;

type Phase = "idle" | "in";

export default function RouteTransitionShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const timeoutRef = useRef<number | null>(null);
  const [displayChildren, setDisplayChildren] = useState(children);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    const previousPath = previousPathRef.current;
    if (previousPath === pathname) {
      setDisplayChildren(children);
      return;
    }

    previousPathRef.current = pathname;
    setDisplayChildren(children);
    setPhase("in");

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setPhase("idle");
    }, TRANSITION_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname, children]);

  return (
    <div
      data-route-shell
      className={phase === "in" ? "route-phase-in" : "route-phase-idle"}
    >
      {displayChildren}
    </div>
  );
}
