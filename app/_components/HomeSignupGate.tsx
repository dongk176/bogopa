"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HOME_SCROLL_TOP_ONCE_KEY } from "@/app/_components/LegalExitScrollMarker";

type UserProfileResponse = {
  profileCompleted: boolean;
};

export default function HomeSignupGate() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const guardSignup = async () => {
      try {
        const shouldScrollTop = window.sessionStorage.getItem(HOME_SCROLL_TOP_ONCE_KEY) === "1";
        if (shouldScrollTop) {
          window.sessionStorage.removeItem(HOME_SCROLL_TOP_ONCE_KEY);
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }

        const response = await fetch("/api/user/profile", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as { ok?: boolean; profile?: UserProfileResponse };
        if (cancelled) return;

        if (payload.profile && !payload.profile.profileCompleted) {
          router.replace("/signup?returnTo=%2Fstep-1");
        }
      } catch (error) {
        console.error("[home] failed to check signup completion", error);
      }
    };

    void guardSignup();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
