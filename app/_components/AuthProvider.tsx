"use client";

import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";
import { usePathname, useRouter } from "next/navigation";
import { signIn, SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import { useSession } from "next-auth/react";

function normalizeNextPath(nextPath: string | null) {
    if (!nextPath || !nextPath.startsWith("/")) return "/step-1";
    if (nextPath.startsWith("/api/")) return "/step-1";
    if (nextPath.startsWith("/auth/")) return "/step-1";
    if (nextPath.startsWith("/signup")) return "/step-1";
    return nextPath;
}

function MobileAuthBridge() {
    const router = useRouter();
    const pathname = usePathname();
    const { status } = useSession();

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            document.documentElement.classList.add("native-app");
            document.body.classList.add("native-app");
        }
    }, []);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        if (status !== "unauthenticated") return;
        if (pathname !== "/") return;
        router.replace("/login");
    }, [pathname, router, status]);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
        void Keyboard.setStyle({ style: KeyboardStyle.Light }).catch(() => {});
        void Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});

        const readViewportKeyboardInset = () => {
            const viewport = window.visualViewport;
            if (!viewport) return 0;
            const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
            return inset > 4 ? inset : 0;
        };

        const applyKeyboardInset = (height: number) => {
            const safeHeight = Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0;
            document.documentElement.style.setProperty("--bogopa-keyboard-height", `${safeHeight}px`);
            window.dispatchEvent(
                new CustomEvent("bogopa-keyboard-inset-change", {
                    detail: { height: safeHeight },
                }),
            );
        };

        applyKeyboardInset(0);

        let removeWillShow: (() => void) | null = null;
        let removeDidShow: (() => void) | null = null;
        let removeWillHide: (() => void) | null = null;
        let removeDidHide: (() => void) | null = null;
        let viewportSyncTimeoutId: number | null = null;

        const syncFromViewport = () => {
            applyKeyboardInset(readViewportKeyboardInset());
        };

        const setup = async () => {
            const willShow = await Keyboard.addListener("keyboardWillShow", (info) => {
                applyKeyboardInset(Math.max(info?.keyboardHeight ?? 0, readViewportKeyboardInset()));
            });
            const didShow = await Keyboard.addListener("keyboardDidShow", (info) => {
                applyKeyboardInset(Math.max(info?.keyboardHeight ?? 0, readViewportKeyboardInset()));
            });
            const willHide = await Keyboard.addListener("keyboardWillHide", () => {
                applyKeyboardInset(0);
            });
            const didHide = await Keyboard.addListener("keyboardDidHide", () => {
                if (viewportSyncTimeoutId !== null) {
                    window.clearTimeout(viewportSyncTimeoutId);
                }
                viewportSyncTimeoutId = window.setTimeout(syncFromViewport, 16);
            });

            removeWillShow = () => {
                void willShow.remove();
            };
            removeDidShow = () => {
                void didShow.remove();
            };
            removeWillHide = () => {
                void willHide.remove();
            };
            removeDidHide = () => {
                void didHide.remove();
            };
        };

        void setup();
        window.addEventListener("resize", syncFromViewport);
        window.visualViewport?.addEventListener("resize", syncFromViewport);
        window.visualViewport?.addEventListener("scroll", syncFromViewport);

        return () => {
            applyKeyboardInset(0);
            removeWillShow?.();
            removeDidShow?.();
            removeWillHide?.();
            removeDidHide?.();
            if (viewportSyncTimeoutId !== null) {
                window.clearTimeout(viewportSyncTimeoutId);
            }
            window.removeEventListener("resize", syncFromViewport);
            window.visualViewport?.removeEventListener("resize", syncFromViewport);
            window.visualViewport?.removeEventListener("scroll", syncFromViewport);
        };
    }, []);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const viewportContent =
            "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
        let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
        if (!viewportMeta) {
            viewportMeta = document.createElement("meta");
            viewportMeta.name = "viewport";
            document.head.appendChild(viewportMeta);
        }
        viewportMeta.setAttribute("content", viewportContent);

        const preventGesture = (event: Event) => {
            event.preventDefault();
        };

        const preventPinch = (event: TouchEvent) => {
            const nativeEvent = event as TouchEvent & { scale?: number };
            if (event.touches.length > 1 || (typeof nativeEvent.scale === "number" && nativeEvent.scale !== 1)) {
                event.preventDefault();
            }
        };

        document.addEventListener("gesturestart", preventGesture, { passive: false });
        document.addEventListener("gesturechange", preventGesture, { passive: false });
        document.addEventListener("gestureend", preventGesture, { passive: false });
        document.addEventListener("touchmove", preventPinch, { passive: false });
        const preventContextMenu = (event: Event) => {
            const target = event.target as Element | null;
            if (!target) return;
            if (target.closest("a,button,[role='button']")) {
                event.preventDefault();
            }
        };
        document.addEventListener("contextmenu", preventContextMenu, true);

        return () => {
            document.removeEventListener("gesturestart", preventGesture);
            document.removeEventListener("gesturechange", preventGesture);
            document.removeEventListener("gestureend", preventGesture);
            document.removeEventListener("touchmove", preventPinch);
            document.removeEventListener("contextmenu", preventContextMenu, true);
        };
    }, []);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let isHandling = false;
        const listenerPromise = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
            if (!url || isHandling) return;

            let parsedUrl: URL;
            try {
                parsedUrl = new URL(url);
            } catch {
                return;
            }

            if (parsedUrl.protocol !== "co.kr.bogopa.app:") return;
            if (parsedUrl.hostname !== "auth" || parsedUrl.pathname !== "/complete") return;

            const isBlocked = parsedUrl.searchParams.get("blocked") === "1";
            if (isBlocked) {
                const until = parsedUrl.searchParams.get("until")?.trim() || "";
                const provider = parsedUrl.searchParams.get("provider")?.trim() || "";
                const params = new URLSearchParams({ blocked: "1" });
                if (until) params.set("until", until);
                if (provider) params.set("provider", provider);
                await Browser.close().catch(() => {});
                router.replace(`/?${params.toString()}`);
                return;
            }

            const token = parsedUrl.searchParams.get("token")?.trim() || "";
            const nextPath = normalizeNextPath(parsedUrl.searchParams.get("next"));
            if (!token) return;

            isHandling = true;
            try {
                await Browser.close().catch(() => {});
                const result = await signIn("mobile-token", {
                    token,
                    redirect: false,
                    callbackUrl: nextPath,
                });

                if (result?.error) {
                    router.replace("/");
                    return;
                }

                router.replace(nextPath);
            } finally {
                isHandling = false;
            }
        });

        return () => {
            void listenerPromise.then((listener) => listener.remove());
        };
    }, [router]);

    return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <MobileAuthBridge />
            {children}
        </SessionProvider>
    );
}
