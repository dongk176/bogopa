"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const STEP_PATH_REGEX = /^\/step-\d+$/;
const CHAT_PATH_REGEX = /^\/chat(?:\/.*)?$/;

export default function StepRouteScrollTop() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (!STEP_PATH_REGEX.test(pathname) && !CHAT_PATH_REGEX.test(pathname)) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
