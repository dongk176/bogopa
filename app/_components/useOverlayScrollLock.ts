"use client";

import { useEffect } from "react";

type HtmlStylesSnapshot = {
  overflow: string;
  overscrollBehavior: string;
};

type BodyStylesSnapshot = {
  overflow: string;
  overscrollBehavior: string;
};

let overlayLockCount = 0;
let htmlSnapshot: HtmlStylesSnapshot | null = null;
let bodySnapshot: BodyStylesSnapshot | null = null;

function lockOverlayScroll() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;

  if (overlayLockCount === 0) {
    htmlSnapshot = {
      overflow: html.style.overflow,
      overscrollBehavior: html.style.overscrollBehavior,
    };
    bodySnapshot = {
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };
  }

  overlayLockCount += 1;
  html.classList.add("modal-open");
  body.classList.add("modal-open");
}

function unlockOverlayScroll() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;

  overlayLockCount = Math.max(overlayLockCount - 1, 0);
  if (overlayLockCount > 0) return;

  html.classList.remove("modal-open");
  body.classList.remove("modal-open");

  if (htmlSnapshot) {
    html.style.overflow = htmlSnapshot.overflow;
    html.style.overscrollBehavior = htmlSnapshot.overscrollBehavior;
  } else {
    html.style.overflow = "";
    html.style.overscrollBehavior = "";
  }

  if (bodySnapshot) {
    body.style.overflow = bodySnapshot.overflow;
    body.style.overscrollBehavior = bodySnapshot.overscrollBehavior;
  } else {
    body.style.overflow = "";
    body.style.overscrollBehavior = "";
  }
}

export default function useOverlayScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    lockOverlayScroll();
    return () => {
      unlockOverlayScroll();
    };
  }, [isOpen]);
}

