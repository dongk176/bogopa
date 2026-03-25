"use client";

import { useEffect } from "react";

export const HOME_SCROLL_TOP_ONCE_KEY = "bogopa_home_scroll_top_once";

export default function LegalExitScrollMarker() {
  useEffect(() => {
    return () => {
      try {
        window.sessionStorage.setItem(HOME_SCROLL_TOP_ONCE_KEY, "1");
      } catch {
        // noop
      }
    };
  }, []);

  return null;
}
