"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import LoginModal from "@/app/_components/LoginModal";
import useMemoryCreateGuard from "@/app/_components/useMemoryCreateGuard";

type PersonaCard = {
  persona_id: string;
  name: string;
  avatar_url: string | null;
  created_at?: string;
  updated_at?: string;
};

type LetterQuotaPayload = {
  ok?: boolean;
  quota?: {
    canCreate?: boolean;
    requiresPass?: boolean;
    remaining?: number;
  };
};

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 19.4a6.6 6.6 0 0 1 13 0" />
    </svg>
  );
}

function CalendarCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-14 w-14" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 3.8v3.4M16.5 3.8v3.4M3.5 9.2h17" />
      <path d="m9.2 14 2 2 3.8-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function LetterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="m4.8 7.5 7.2 6 7.2-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type AddMemoryButtonProps = {
  isLoggedIn: boolean;
  onRequireLogin: (nextPath: string) => void;
  onStartCreate: () => void;
  isChecking: boolean;
};

const HOME_BRAND_COLOR = "#3e5560";
const HOME_BRAND_SECONDARY_COLOR = "#4a626d";
const HOME_PLUS_GRADIENT_START = "#6f8998";
const HOME_PLUS_GRADIENT_END = "#89a5b4";
const HOME_LETTER_BG = "#5f7b8a";
const MEMORY_BUTTON_SIZE = 156;

function AddMemoryButton({ isLoggedIn, onRequireLogin, onStartCreate, isChecking }: AddMemoryButtonProps) {
  const className =
    "flex shrink-0 items-center justify-center rounded-2xl transition-opacity active:opacity-95";

  if (isLoggedIn) {
    return (
      <div
        className="shrink-0 rounded-2xl"
        style={{ boxShadow: "0 2px 10px rgba(47, 52, 46, 0.12)" }}
      >
        <button
          type="button"
          onClick={onStartCreate}
          disabled={isChecking}
          className={className}
          style={{
            width: `${MEMORY_BUTTON_SIZE}px`,
            height: `${MEMORY_BUTTON_SIZE}px`,
            color: "#f8fbff",
            backgroundImage: `linear-gradient(215deg, ${HOME_PLUS_GRADIENT_START} 0%, ${HOME_PLUS_GRADIENT_END} 100%)`,
          }}
          aria-label="내 기억 추가"
        >
          <PlusIcon />
        </button>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 rounded-2xl"
      style={{ boxShadow: "0 2px 10px rgba(47, 52, 46, 0.12)" }}
    >
      <button
        type="button"
        onClick={() => onRequireLogin("/step-1/start")}
        className={className}
        style={{
          width: `${MEMORY_BUTTON_SIZE}px`,
          height: `${MEMORY_BUTTON_SIZE}px`,
          color: "#f8fbff",
          backgroundImage: `linear-gradient(215deg, ${HOME_PLUS_GRADIENT_START} 0%, ${HOME_PLUS_GRADIENT_END} 100%)`,
        }}
        aria-label="내 기억 추가"
      >
        <PlusIcon />
      </button>
    </div>
  );
}

export default function HomeMemoryCarousel() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isHydrated, setIsHydrated] = useState(false);
  const [items, setItems] = useState<PersonaCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLetterMemoryRequiredOpen, setIsLetterMemoryRequiredOpen] = useState(false);
  const [isLetterPassRequiredOpen, setIsLetterPassRequiredOpen] = useState(false);
  const [isLetterDailyLimitOpen, setIsLetterDailyLimitOpen] = useState(false);
  const [isLetterQuotaChecking, setIsLetterQuotaChecking] = useState(false);
  const [letterRemainingCount, setLetterRemainingCount] = useState<number | null>(null);
  const [loginNextPath, setLoginNextPath] = useState("/step-1/start");
  const { guardCreateStart, modalNode, isChecking } = useMemoryCreateGuard();

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (status === "unauthenticated" || !session) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/persona", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { ok?: boolean; personas?: PersonaCard[] };
        if (!cancelled && payload.ok && Array.isArray(payload.personas)) {
          const sorted = [...payload.personas].sort((a, b) => {
            const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (aCreated !== bCreated) return bCreated - aCreated;

            const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return bUpdated - aUpdated;
          });
          setItems(sorted);
        }
      } catch {
        // Keep current items on transient errors to prevent flicker.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [status, session]);

  useEffect(() => {
    if (!isHydrated || status === "loading") return;
    if (!session) {
      setLetterRemainingCount(null);
      return;
    }

    let cancelled = false;
    const loadLetterQuota = async () => {
      try {
        const response = await fetch("/api/letters?quota=1", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as LetterQuotaPayload;
        if (!cancelled && typeof payload.quota?.remaining === "number") {
          setLetterRemainingCount(Math.max(0, payload.quota.remaining));
        }
      } catch {
        if (!cancelled) setLetterRemainingCount(null);
      }
    };

    void loadLetterQuota();
    return () => {
      cancelled = true;
    };
  }, [isHydrated, session, status]);

  const isOverlayBlockingScroll =
    isLetterMemoryRequiredOpen || isLetterPassRequiredOpen || isLetterDailyLimitOpen;

  useEffect(() => {
    if (!isOverlayBlockingScroll || typeof document === "undefined") return;

    const body = document.body;
    const html = document.documentElement;
    const hadBodyClass = body.classList.contains("modal-open");
    const hadHtmlClass = html.classList.contains("modal-open");
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;

    body.classList.add("modal-open");
    html.classList.add("modal-open");
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    return () => {
      if (!hadBodyClass) body.classList.remove("modal-open");
      if (!hadHtmlClass) html.classList.remove("modal-open");
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [isOverlayBlockingScroll]);

  const shouldShowLoading = (!isHydrated || status === "loading" || isLoading) && items.length === 0;
  const canOpenLetters = isHydrated && status !== "loading" && Boolean(session);
  const handleStartCreate = () => {
    void guardCreateStart({
      returnTo: "/",
      onAllowed: () => router.push("/step-1/start"),
    });
  };
  const handleOpenLetters = async () => {
    if (canOpenLetters) {
      if (items.length === 0) {
        setIsLetterMemoryRequiredOpen(true);
        return;
      }
      if (isLetterQuotaChecking) return;

      setIsLetterQuotaChecking(true);
      try {
        const response = await fetch("/api/letters?quota=1", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json().catch(() => ({}))) as LetterQuotaPayload;
          const canCreate = payload.quota?.canCreate;
          const requiresPass = Boolean(payload.quota?.requiresPass);
          if (canCreate === false) {
            if (typeof payload.quota?.remaining === "number") {
              setLetterRemainingCount(Math.max(0, payload.quota.remaining));
            }
            if (requiresPass) {
              setIsLetterPassRequiredOpen(true);
              return;
            }
            setIsLetterDailyLimitOpen(true);
            return;
          }
          if (typeof payload.quota?.remaining === "number") {
            setLetterRemainingCount(Math.max(0, payload.quota.remaining));
          }
        }
      } catch {
        // Fall through to letters screen on transient precheck failures.
      } finally {
        setIsLetterQuotaChecking(false);
      }

      router.push("/letters");
      return;
    }
    if (isHydrated) {
      setLoginNextPath("/letters");
      setIsLoginModalOpen(true);
    }
  };

  return (
    <section className="mx-auto mt-3 w-full max-w-none px-0 pb-[calc(7rem+max(env(safe-area-inset-bottom),0.5rem))]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-headline text-xl font-bold text-[#f0f5f2]">내 기억</h2>
        {items.length >= 3 ? (
          <Link href="/persona" className="text-xs font-semibold text-[#b9cad1]">
            전체보기
          </Link>
        ) : null}
      </div>

      <div className="h-[172px]">
        {shouldShowLoading ? (
          <div className="h-full" />
        ) : items.length > 0 ? (
          <div className="hide-scrollbar flex h-full items-start gap-3 overflow-x-auto overflow-y-visible pb-3">
            {items.map((item) => {
              const avatarUrl =
                item.avatar_url && item.avatar_url.includes("amazonaws.com")
                  ? `/api/image-proxy?url=${encodeURIComponent(item.avatar_url)}`
                  : item.avatar_url;

              return (
                <Link
                  key={item.persona_id}
                  href={`/chat?id=${item.persona_id}`}
                  className="flex shrink-0 flex-col items-center justify-between rounded-2xl bg-[#303733]/95 px-3 pt-3 pb-0 text-center"
                  style={{
                    width: `${MEMORY_BUTTON_SIZE}px`,
                    height: `${MEMORY_BUTTON_SIZE}px`,
                    boxShadow: "0 2px 8px rgba(47, 52, 46, 0.12)",
                  }}
                >
                  <div className="mx-auto h-[104px] w-[104px] overflow-hidden rounded-xl bg-white/10">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[#b9cad1]">
                        <UserIcon />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 translate-y-1 line-clamp-2 min-h-[2rem] text-sm font-bold leading-4 text-[#f0f5f2]">{item.name || "이름 없음"}</p>
                </Link>
              );
            })}
            <AddMemoryButton
              isLoggedIn={Boolean(session)}
              isChecking={isChecking}
              onStartCreate={handleStartCreate}
              onRequireLogin={(nextPath) => {
                setLoginNextPath(nextPath);
                setIsLoginModalOpen(true);
              }}
            />
          </div>
        ) : (
          <div className="flex h-full items-start justify-start pb-3">
            <AddMemoryButton
              isLoggedIn={Boolean(session)}
              isChecking={isChecking}
              onStartCreate={handleStartCreate}
              onRequireLogin={(nextPath) => {
                setLoginNextPath(nextPath);
                setIsLoginModalOpen(true);
              }}
            />
          </div>
        )}
      </div>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        nextPath={loginNextPath}
      />
      {isLetterMemoryRequiredOpen ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
          onClick={() => setIsLetterMemoryRequiredOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[#d6ddd8] bg-white p-5 shadow-[0_18px_42px_rgba(0,0,0,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-headline text-xl font-extrabold tracking-tight text-[#2f342e]">
              먼저 내 기억을 만들어주세요.
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5d605a]">
              매일 편지 한 통을 받으려면 대화할 내 기억이 필요해요.
            </p>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setIsLetterMemoryRequiredOpen(false);
                  handleStartCreate();
                }}
                className="w-full max-w-[220px] rounded-2xl bg-[#4a626d] px-4 py-3 text-sm font-extrabold text-[#f0f9ff]"
              >
                내 기억 만들기
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {modalNode}

      <div className="mb-3 mt-6 flex items-center justify-between">
        <h2 className="font-headline text-xl font-bold text-[#f0f5f2]">출석체크</h2>
      </div>

      <div>
        <Link
          href="/attendance"
          className="flex min-h-[86px] items-center rounded-2xl border bg-[#303733]/95 px-4 py-3"
          style={{ borderColor: HOME_BRAND_COLOR }}
        >
          <div className="flex w-full items-center gap-3">
            <div className="shrink-0 self-center leading-none" style={{ color: HOME_BRAND_COLOR }}>
              <CalendarCheckIcon />
            </div>
            <p className="text-base font-extrabold tracking-tight text-[#f0f5f2]">
              매일 출석하고, 보상 받아가세요.
            </p>
          </div>
        </Link>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => void handleOpenLetters()}
          className="group relative block min-h-[186px] w-full overflow-hidden rounded-2xl text-left"
        >
          <div className="absolute inset-0" style={{ backgroundColor: HOME_LETTER_BG }} />
          <div className="absolute inset-0 bg-[linear-gradient(215deg,rgba(86,117,132,0.9)_0%,rgba(116,148,163,0.82)_42%,rgba(72,101,115,0.9)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(115%_105%_at_86%_6%,rgba(232,243,248,0.3)_0%,rgba(232,243,248,0.14)_26%,rgba(232,243,248,0)_56%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(95%_82%_at_12%_88%,rgba(176,204,218,0.34)_0%,rgba(176,204,218,0.16)_36%,rgba(176,204,218,0)_70%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(32,52,64,0.32)_0%,rgba(32,52,64,0.08)_38%,rgba(32,52,64,0)_66%)]" />
          <div
            className="pointer-events-none absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold"
            style={{
              color: "#f8fbff",
              borderColor: "rgba(232, 240, 245, 0.45)",
              backgroundColor: "rgba(62, 85, 96, 0.9)",
            }}
          >
            <LetterIcon />
            <span>{typeof letterRemainingCount === "number" ? `${letterRemainingCount}회` : "--"}</span>
          </div>

          <div className="relative z-10 flex h-full min-h-[186px] flex-col justify-end p-5">
            <span
              className="mb-3 inline-flex w-fit rounded-full border px-3 py-1 text-[10px] font-extrabold tracking-[0.16em]"
              style={{
                backgroundColor: HOME_BRAND_SECONDARY_COLOR,
                borderColor: HOME_BRAND_SECONDARY_COLOR,
                color: "#f8fbff",
              }}
            >
              TODAY&apos;S LETTER
            </span>
            <h3 className="font-headline text-2xl font-extrabold leading-tight" style={{ color: "#f8fbff" }}>
              매일 편지 한 통
            </h3>
            <p className="mt-2 text-sm font-semibold" style={{ color: "#e3eff5" }}>
              기억에게서, 매일 편지를 받아보세요.
            </p>
            <div className="mt-4 inline-flex w-fit items-center rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#2c4450] transition-transform duration-200 group-active:scale-95">
              {isLetterQuotaChecking ? "확인 중..." : "지금 받아보기"}
            </div>
          </div>
        </button>
      </div>

      {isLetterPassRequiredOpen ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center px-5"
          onClick={() => setIsLetterPassRequiredOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#303733] p-7 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-headline text-xl font-bold text-[#f0f5f2]">
              기억 패스가 필요합니다.
            </h3>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[#5d605a]">
              오늘은 이미 편지를 1개 받았어요.
              <br />
              기억 패스 등록하고 하루에 10통의 편지를 받아보세요.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsLetterPassRequiredOpen(false)}
                className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-[#f0f5f2] hover:bg-white/5"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLetterPassRequiredOpen(false);
                  router.push("/payment?returnTo=%2F");
                }}
                className="whitespace-nowrap rounded-xl bg-[#4a626d] px-4 py-3 text-[13px] font-extrabold text-[#f0f9ff] hover:bg-[#3e5661]"
              >
                기억 패스 등록하기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLetterDailyLimitOpen ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
          onClick={() => setIsLetterDailyLimitOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[#d6ddd8] bg-white p-5 shadow-[0_18px_42px_rgba(0,0,0,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-headline text-xl font-extrabold tracking-tight text-[#2f342e]">
              오늘은 여기까지예요.
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5d605a]">
              오늘 받을 수 있는 편지 10개를 모두 받았어요. 내일 다시 받아보세요.
            </p>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setIsLetterDailyLimitOpen(false)}
                className="w-full max-w-[220px] rounded-xl bg-[#4a626d] px-4 py-3 text-sm font-extrabold text-[#f0f9ff]"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
