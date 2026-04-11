"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const APP_OPEN_KEY = "bogopa_diag_app_open_v1";
const APP_PERF_KEY = "bogopa_diag_app_perf_v1";
const MAX_ERROR_EVENTS_PER_PAGE = 3;

type AnalyticsEventName = "app_open" | "app_performance" | "app_error";

function detectClientPlatform() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  const isNative =
    ua.includes("capacitor") ||
    ua.includes("cordova") ||
    ua.includes("co.kr.bogopa.app") ||
    ua.includes("bogopa-native");
  const os = /iphone|ipad|ipod/.test(ua) ? "ios" : /android/.test(ua) ? "android" : "web";
  return { isNative, os };
}

function toRoundedMs(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  if (value < 0) return 0;
  return Math.round(value);
}

function sanitizeDiagnosticText(value: unknown, max = 180) {
  if (typeof value !== "string") return undefined;
  const compact = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return undefined;
  return compact.slice(0, max);
}

async function sendAnalyticsEvent(eventName: AnalyticsEventName, properties: Record<string, unknown>) {
  try {
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName, properties }),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // Ignore diagnostics failures to avoid affecting UX.
  }
}

export default function ClientDiagnosticsReporter() {
  const pathname = usePathname();
  const errorCountRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const { isNative, os } = detectClientPlatform();
    const nowIso = new Date().toISOString();
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const appLoadMs = toRoundedMs(nav?.loadEventEnd ? nav.loadEventEnd - nav.startTime : undefined);
    const ttfbMs = toRoundedMs(nav?.responseStart ? nav.responseStart - nav.requestStart : undefined);
    const domInteractiveMs = toRoundedMs(nav?.domInteractive);

    if (!sessionStorage.getItem(APP_OPEN_KEY)) {
      sessionStorage.setItem(APP_OPEN_KEY, "1");
      void sendAnalyticsEvent("app_open", {
        path: pathname || "/",
        isNativeApp: isNative,
        platform: os,
        appLoadMs,
        ttfbMs,
        domInteractiveMs,
        reportedAt: nowIso,
      });
    }

    let lcpMs: number | undefined;
    let cls = 0;
    let fcpMs: number | undefined;
    let perfFlushed = false;

    const paintEntries = performance.getEntriesByType("paint");
    const fcpEntry = paintEntries.find((entry) => entry.name === "first-contentful-paint");
    if (fcpEntry) {
      fcpMs = toRoundedMs(fcpEntry.startTime);
    }

    const lcpObserver =
      typeof PerformanceObserver !== "undefined"
        ? new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
              lcpMs = toRoundedMs(entry.startTime);
            }
          })
        : null;
    const clsObserver =
      typeof PerformanceObserver !== "undefined"
        ? new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries() as unknown as Array<{
              value: number;
              hadRecentInput: boolean;
            }>) {
              if (!entry.hadRecentInput) cls += entry.value;
            }
          })
        : null;

    try {
      lcpObserver?.observe({ type: "largest-contentful-paint", buffered: true });
      clsObserver?.observe({ type: "layout-shift", buffered: true });
    } catch {
      // Unsupported browser/runtime.
    }

    const flushPerformance = () => {
      if (perfFlushed) return;
      perfFlushed = true;
      if (!sessionStorage.getItem(APP_PERF_KEY)) {
        sessionStorage.setItem(APP_PERF_KEY, "1");
        void sendAnalyticsEvent("app_performance", {
          path: pathname || "/",
          isNativeApp: isNative,
          platform: os,
          appLoadMs,
          ttfbMs,
          domInteractiveMs,
          fcpMs,
          lcpMs,
          cls: Number(cls.toFixed(4)),
          reportedAt: new Date().toISOString(),
        });
      }
      lcpObserver?.disconnect();
      clsObserver?.disconnect();
    };

    const perfTimer = window.setTimeout(flushPerformance, 5000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPerformance();
    };
    const onPageHide = () => flushPerformance();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    const onError = (event: ErrorEvent) => {
      if (errorCountRef.current >= MAX_ERROR_EVENTS_PER_PAGE) return;
      errorCountRef.current += 1;
      void sendAnalyticsEvent("app_error", {
        type: "error",
        path: pathname || "/",
        message: sanitizeDiagnosticText(event.message),
        source: sanitizeDiagnosticText(event.filename),
        line: event.lineno || undefined,
        column: event.colno || undefined,
        reportedAt: new Date().toISOString(),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (errorCountRef.current >= MAX_ERROR_EVENTS_PER_PAGE) return;
      errorCountRef.current += 1;
      const reason =
        typeof event.reason === "string"
          ? event.reason
          : event.reason && typeof event.reason.message === "string"
            ? event.reason.message
            : String(event.reason ?? "unknown");
      void sendAnalyticsEvent("app_error", {
        type: "unhandledrejection",
        path: pathname || "/",
        message: sanitizeDiagnosticText(reason),
        reportedAt: new Date().toISOString(),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.clearTimeout(perfTimer);
      flushPerformance();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [pathname]);

  return null;
}
