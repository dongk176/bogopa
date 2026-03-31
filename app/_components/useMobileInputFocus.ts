"use client";

import { useEffect, useState } from "react";

function isFocusableField(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;

  const tagName = element.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function isElementVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getBoundingClientRect().height > 0;
}

function findScrollableAncestor(element: HTMLElement) {
  let current: HTMLElement | null = element.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight + 1;
    if (canScroll) return current;
    current = current.parentElement;
  }
  return null;
}

function getFixedTopOffset() {
  const headers = Array.from(document.querySelectorAll<HTMLElement>("header.fixed.top-0"));
  let maxHeight = 0;
  for (const header of headers) {
    if (!isElementVisible(header)) continue;
    maxHeight = Math.max(maxHeight, header.getBoundingClientRect().height);
  }
  return maxHeight;
}

function getFixedBottomOffset() {
  const fixedBottomBlocks = Array.from(document.querySelectorAll<HTMLElement>(".fixed.bottom-0"));
  let maxHeight = 0;
  for (const block of fixedBottomBlocks) {
    if (!isElementVisible(block)) continue;
    maxHeight = Math.max(maxHeight, block.getBoundingClientRect().height);
  }
  return maxHeight;
}

function getNativeKeyboardInset() {
  const raw =
    document.documentElement.style.getPropertyValue("--bogopa-keyboard-height") ||
    window.getComputedStyle(document.documentElement).getPropertyValue("--bogopa-keyboard-height");
  const parsed = Number.parseFloat(raw || "0");
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function isNativeRuntime() {
  return document.documentElement.classList.contains("native-app");
}

export default function useMobileInputFocus() {
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    const isMobile = () => window.matchMedia("(max-width: 1023px)").matches;
    const activeTimers: number[] = [];
    let rafId = 0;

    const clearScheduledReveal = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      while (activeTimers.length > 0) {
        const timer = activeTimers.pop();
        if (typeof timer === "number") window.clearTimeout(timer);
      }
    };

    const revealField = (element: HTMLElement) => {
      if (!element.isConnected) return;
      if (!isFocusableField(element)) return;

      // 1) Let browser perform nearest auto-scroll first.
      element.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });

      // 2) Then compensate with viewport + fixed chrome insets.
      const visualViewport = window.visualViewport;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportBottomBase = viewportTop + viewportHeight;
      const viewportKeyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
      const nativeKeyboardInset = getNativeKeyboardInset();
      const shouldApplyFallbackKeyboardInset =
        isNativeRuntime() && viewportKeyboardInset < 20 && nativeKeyboardInset < 20;
      const fallbackKeyboardInset = shouldApplyFallbackKeyboardInset ? 320 : 0;
      const effectiveKeyboardInset = Math.max(viewportKeyboardInset, nativeKeyboardInset, fallbackKeyboardInset);
      const viewportBottom = Math.max(viewportTop, viewportBottomBase - effectiveKeyboardInset);

      const fixedTop = getFixedTopOffset();
      const fixedBottom = getFixedBottomOffset();

      const visibleTop = viewportTop + fixedTop + 8;
      const visibleBottom = viewportBottom - fixedBottom - 14;
      const rect = element.getBoundingClientRect();

      let delta = 0;
      if (rect.top < visibleTop) {
        delta = rect.top - visibleTop;
      } else if (rect.bottom > visibleBottom) {
        delta = rect.bottom - visibleBottom;
      }

      if (Math.abs(delta) < 1) return;

      const scrollParent = findScrollableAncestor(element);
      if (scrollParent) {
        const currentTop = scrollParent.scrollTop;
        const maxTop = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);
        const nextTop = Math.min(maxTop, Math.max(0, currentTop + delta));
        scrollParent.scrollTop = nextTop;
        if (Math.abs(scrollParent.scrollTop - currentTop) > 1) {
          return;
        }
      } else {
        const root = document.scrollingElement as HTMLElement | null;
        if (root) {
          const currentTop = root.scrollTop;
          const maxTop = Math.max(0, root.scrollHeight - root.clientHeight);
          const nextTop = Math.min(maxTop, Math.max(0, currentTop + delta));
          root.scrollTop = nextTop;
          return;
        }
      }

      window.scrollBy({ top: delta, left: 0, behavior: "auto" });
    };

    const ensureFieldVisible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return;
      if (!isFocusableField(element)) return;

      clearScheduledReveal();
      const run = () => revealField(element);
      rafId = window.requestAnimationFrame(run);

      // Keyboard open/layout shift phases differ per device/browser.
      // Run a few delayed passes to stabilize final position.
      [60, 140, 260, 420, 620].forEach((delay) => {
        const id = window.setTimeout(run, delay);
        activeTimers.push(id);
      });
    };

    const updateFocusState = () => {
      if (!isMobile()) {
        setIsInputFocused(false);
        return;
      }
      setIsInputFocused(isFocusableField(document.activeElement));
    };

    const handleFocusIn = (event: FocusEvent) => {
      updateFocusState();
      if (!isMobile()) return;
      ensureFieldVisible(event.target as Element | null);
    };

    const handleFocusOut = () => {
      window.setTimeout(updateFocusState, 0);
    };

    const handleViewportChanged = () => {
      if (!isMobile()) return;
      if (!isFocusableField(document.activeElement)) return;
      ensureFieldVisible(document.activeElement);
    };

    const handleKeyboardInsetChanged = () => {
      if (!isMobile()) return;
      if (!isFocusableField(document.activeElement)) return;
      ensureFieldVisible(document.activeElement);
    };

    updateFocusState();
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("resize", handleViewportChanged);
    window.visualViewport?.addEventListener("resize", handleViewportChanged);
    window.visualViewport?.addEventListener("scroll", handleViewportChanged);
    window.addEventListener("bogopa-keyboard-inset-change", handleKeyboardInsetChanged as EventListener);

    return () => {
      clearScheduledReveal();
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("resize", handleViewportChanged);
      window.visualViewport?.removeEventListener("resize", handleViewportChanged);
      window.visualViewport?.removeEventListener("scroll", handleViewportChanged);
      window.removeEventListener("bogopa-keyboard-inset-change", handleKeyboardInsetChanged as EventListener);
    };
  }, []);

  return isInputFocused;
}
