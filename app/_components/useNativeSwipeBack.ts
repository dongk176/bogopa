"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect, useRef } from "react";

type UseNativeSwipeBackOptions = {
  enabled?: boolean;
  edgeStartPx?: number;
  minDistancePx?: number;
  maxVerticalDeltaPx?: number;
  startMode?: "edge" | "content";
};

export default function useNativeSwipeBack(onBack: () => void, options?: UseNativeSwipeBackOptions) {
  const onBackRef = useRef(onBack);
  const lockRef = useRef(false);

  onBackRef.current = onBack;

  useEffect(() => {
    const enabled = options?.enabled !== false;
    if (!enabled) return;
    if (!Capacitor.isNativePlatform()) return;

    const edgeStartPx = options?.edgeStartPx ?? 28;
    const minDistancePx = options?.minDistancePx ?? 72;
    const maxVerticalDeltaPx = options?.maxVerticalDeltaPx ?? 56;
    const startMode = options?.startMode ?? "content";

    let tracking = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-swipe-back-ignore='true']")) return;
      if (target?.closest(".fixed.top-0, .sticky.top-0, .fixed.bottom-0")) return;

      startX = touch.clientX;
      startY = touch.clientY;
      lastX = touch.clientX;
      lastY = touch.clientY;
      tracking = startMode === "edge" ? startX <= edgeStartPx : true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      lastX = touch.clientX;
      lastY = touch.clientY;
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (lockRef.current) return;

      const dx = lastX - startX;
      const dy = Math.abs(lastY - startY);
      if (dx < minDistancePx) return;
      if (Math.abs(dx) <= dy) return;
      if (dy > maxVerticalDeltaPx) return;

      lockRef.current = true;
      onBackRef.current();
      window.setTimeout(() => {
        lockRef.current = false;
      }, 320);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [options?.edgeStartPx, options?.enabled, options?.maxVerticalDeltaPx, options?.minDistancePx, options?.startMode]);
}
