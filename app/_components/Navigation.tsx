"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Suspense, useState, useEffect } from "react";
import LoginModal from "./LoginModal";
import LogoutConfirmModal from "@/app/_components/LogoutConfirmModal";

type StoredChatState = {
  personaId: string;
  personaName?: string;
  avatarUrl?: string;
  lastMessage?: string;
  updatedAt: string;
};

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function MessagesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function MemoryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function UserDefaultIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function NavigationContent({ hideMobileBottomNav = false }: { hideMobileBottomNav?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeChatId = searchParams.get("id");
  const isPaymentPage = pathname?.startsWith("/payment");
  const isProfileContext = pathname?.startsWith("/profile") || pathname?.startsWith("/payment");
  const isMessagesContext = pathname?.startsWith("/chat");
  const { data: session } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginNextPath, setLoginNextPath] = useState("/step-1/start");
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut({ callbackUrl: "/" });
    } finally {
      setIsSigningOut(false);
    }
  };

  const openLoginModal = (nextPath: string) => {
    setLoginNextPath(nextPath);
    setIsLoginModalOpen(true);
  };

  const navItems = [
    { id: "home", href: "/", icon: HomeIcon, label: "홈" },
    { id: "messages", href: "/chat/list", icon: MessagesIcon, label: "메시지" },
    { id: "memory", href: "/persona", icon: MemoryIcon, label: "내 기억" },
  ];

  const [savedChats, setSavedChats] = useState<StoredChatState[]>([]);
  const shouldHideMobileBottomNav = hideMobileBottomNav;

  useEffect(() => {
    if (!session) return;
    const fetchPersonas = async () => {
      try {
        const res = await fetch("/api/persona", { cache: "no-store" });
        const data = await res.json();
        if (data.ok && Array.isArray(data.personas)) {
          const chats: StoredChatState[] = data.personas.map((p: any) => {
            const lastActivity = p.session_updated_at && new Date(p.session_updated_at) > new Date(p.updated_at)
              ? p.session_updated_at
              : p.updated_at;
            return {
              personaId: p.persona_id,
              personaName: p.name,
              avatarUrl: p.avatar_url,
              lastMessage: p.last_message_content,
              updatedAt: lastActivity,
            };
          });
          chats.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
          setSavedChats(chats);
        }
      } catch (err) {
        console.error("[nav] failed to fetch persona list", err);
      }
    };
    fetchPersonas();
  }, [session]);

  const UserAvatar = ({ size = "w-8 h-8", textClass = "text-xs" }: { size?: string, textClass?: string }) => (
    <UserAvatarInner
      size={size}
      textClass={textClass}
      image={session?.user?.image ?? null}
      name={session?.user?.name ?? null}
    />
  );

  return (
    <>
      {/* Desktop Sidebar */}
      {!isPaymentPage && (
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-[#afb3ac]/20 bg-[#faf9f5] py-8 lg:flex">
        <div className="flex flex-col px-6">
          <Link href="/" className="mb-12 flex items-center gap-3 transition-opacity hover:opacity-80">
            <img src="/logo/bogopa%20logo.png" alt="Logo" className="h-8 w-8 object-contain" />
            <span className="font-headline text-2xl font-extrabold tracking-tight text-[#4a626d]">Bogopa</span>
          </Link>

          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === "messages" ? Boolean(isMessagesContext) : pathname === item.href;
              const isProtected = item.id !== "home";

              if (isProtected && !session) {
                return (
                  <button
                    key={item.id}
                    onClick={() => openLoginModal(item.href)}
                    className="group flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all text-[#655d5a] hover:bg-black/5 hover:text-[#4a626d] w-full text-left"
                  >
                    <Icon className="h-6 w-6 shrink-0" />
                    <span className="font-headline text-base font-bold tracking-tight">{item.label}</span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`group flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all ${isActive
                    ? "bg-[#4a626d] text-white shadow-lg shadow-[#4a626d]/20"
                    : "text-[#655d5a] hover:bg-black/5 hover:text-[#4a626d]"
                    }`}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  <span className="font-headline text-base font-bold tracking-tight">{item.label}</span>
                </Link>
              );
            })}

            {!session ? (
              <button
                onClick={() => openLoginModal("/profile")}
                className="group flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all text-[#655d5a] hover:bg-black/5 hover:text-[#4a626d] w-full text-left"
              >
                <UserAvatar size="w-6 h-6" textClass="text-[10px]" />
                <span className="font-headline text-base font-bold tracking-tight">프로필</span>
              </button>
            ) : (
              <Link
                href="/profile"
                className={`group flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all ${isProfileContext
                  ? "bg-[#4a626d] text-white shadow-lg shadow-[#4a626d]/20"
                  : "text-[#655d5a] hover:bg-black/5 hover:text-[#4a626d]"
                  }`}
              >
                <UserAvatar size="w-6 h-6" textClass="text-[10px]" />
                <span className="font-headline text-base font-bold tracking-tight">프로필</span>
              </Link>
            )}
          </nav>
        </div>

        <div className="mt-auto px-6">
          {session && (
            <button
              onClick={() => {
                setIsLogoutModalOpen(true);
              }}
              className="flex w-full items-center gap-4 rounded-2xl border border-[#ff8f88]/45 bg-[#ff8f88]/16 px-4 py-3 text-sm font-bold text-[#ffd7d3] transition-colors hover:bg-[#ff8f88]/24 hover:text-[#ffe8e6]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              로그아웃
            </button>
          )}
        </div>
      </aside>
      )}

      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        isProcessing={isSigningOut}
        onClose={() => {
          if (isSigningOut) return;
          setIsLogoutModalOpen(false);
        }}
        onConfirm={() => {
          void handleSignOut();
        }}
      />

      {/* Desktop Sub-Sidebar (Chat List) - Visible ONLY on Chat when chats exist */}
      {(pathname?.startsWith("/chat") && savedChats.length > 0) && (
        <aside className="fixed left-64 top-0 z-40 hidden h-screen w-72 flex-col border-r border-[#afb3ac]/20 bg-[#242926] py-8 lg:flex">
          <div className="px-6 mb-6">
            <h2 className="font-headline text-lg font-bold text-[#f0f5f2]">최근 대화</h2>
            <p className="mt-1 text-[11px] font-medium text-[#5d605a]">나만의 페르소나와 대화를 이어가세요</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 scrollbar-hide">
            <div className="space-y-1">
              {savedChats.map((chat) => (
                <div key={chat.personaId} className="relative group">
                  <Link
                    href={`/chat?id=${chat.personaId}`}
                    className={`flex items-center gap-3 rounded-2xl p-3 pr-10 transition-all ${activeChatId === chat.personaId
                      ? "bg-white/10 ring-1 ring-white/10"
                      : "hover:bg-white/5"
                      }`}
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/10">
                      {chat.avatarUrl ? (
                        <img
                          src={chat.avatarUrl.includes("amazonaws.com") ? `/api/image-proxy?url=${encodeURIComponent(chat.avatarUrl)}` : chat.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#f0f5f2]">
                          <UserDefaultIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#f0f5f2] group-hover:text-white">{chat.personaName}</p>
                      <p className="truncate text-[11px] text-[#5d605a] group-hover:text-[#2f342e]">{chat.lastMessage || "새로운 대화"}</p>
                    </div>
                  </Link>

                  <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setOpenMenuId(openMenuId === chat.personaId ? null : chat.personaId);
                      }}
                      className="p-1.5 rounded-lg text-[#afb3ac] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 hover:text-[#f0f5f2]"
                    >
                      <MoreVerticalIcon className="h-4 w-4" />
                    </button>
                    {openMenuId === chat.personaId && (
                      <div className="absolute right-0 mt-1 w-28 bg-[#303733] border border-[#afb3ac]/20 rounded-xl shadow-xl overflow-hidden animate-fade-in">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setOpenMenuId(null);
                            setDeleteTargetId(chat.personaId);
                          }}
                          className="w-full text-left px-4 py-3 text-xs font-bold text-[#f0b6b4] hover:bg-white/5 transition-colors"
                        >
                          삭제하기
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* Delete Confirmation Modal for Navigation */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 px-5 backdrop-blur-md">
          <section className="w-full max-w-sm rounded-[2.5rem] bg-[#303733] p-8 shadow-2xl animate-fade-in relative border border-white/5">
            <h3 className="font-headline text-xl font-bold text-[#f0f5f2]">내 기억 삭제</h3>
            <p className="mt-4 text-sm leading-relaxed text-[#5d605a]">
              선택한 대화 기록을 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteTargetId(null)} className="rounded-2xl border border-[#afb3ac]/30 py-3.5 text-sm font-bold text-[#f0f5f2] hover:bg-white/5">
                취소
              </button>
              <button
                onClick={() => {
                  fetch(`/api/persona?personaId=${deleteTargetId}`, { method: "DELETE" }).catch(e => console.error(e));
                  setSavedChats(prev => prev.filter(c => c.personaId !== deleteTargetId));
                  const removedId = deleteTargetId;
                  setDeleteTargetId(null);
                  if (pathname?.includes(removedId)) {
                    window.location.href = "/chat";
                  }
                }}
                className="rounded-2xl bg-[#9f403d] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#9f403d]/20 hover:opacity-90"
              >
                삭제하기
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Mobile Bottom Tab Bar */}
      {!shouldHideMobileBottomNav ? (
      <nav className="fixed bottom-0 left-0 z-50 flex h-[calc(5.8rem+max(env(safe-area-inset-bottom),0.5rem))] w-full items-start justify-around bg-white px-2 pt-3 lg:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === "messages" ? Boolean(isMessagesContext) : pathname === item.href;
            const isProtected = item.id !== "home";

            const handleClick = (e: React.MouseEvent) => {
              if (isProtected && !session) {
                e.preventDefault();
                openLoginModal(item.href);
              }
            };

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={handleClick}
                className={`flex flex-col items-center justify-center transition-all active:scale-95 ${isActive ? "text-[#3e5560]" : "text-[#111111]"
                  }`}
              >
                <div className={`flex flex-col items-center gap-1.5 px-6 py-2.5 transition-transform ${isActive ? "-translate-y-[2px]" : "translate-y-0"
                  }`}>
                  <Icon className={`h-7 w-7 transition-transform ${isActive ? "scale-110" : "scale-100"}`} />
                  <span className={`text-[12px] font-bold tracking-tight transition-colors ${isActive ? "text-[#3e5560]" : "text-[#111111]"}`}>
                    {item.label}
                  </span>
                </div>
              </Link>
            );
          })}

          {!session ? (
            <button
              onClick={() => openLoginModal("/profile")}
              className={`flex flex-col items-center justify-center transition-all active:scale-95 ${isProfileContext ? "text-[#3e5560]" : "text-[#111111]"
                }`}
            >
              <div className={`flex flex-col items-center gap-1.5 px-6 py-2.5 transition-transform ${isProfileContext ? "-translate-y-[2px]" : "translate-y-0"
                }`}>
                <UserAvatar size="w-7 h-7" textClass="text-[11px]" />
                <span className={`text-[12px] font-bold tracking-tight transition-colors ${isProfileContext ? "text-[#3e5560]" : "text-[#111111]"}`}>
                  프로필
                </span>
              </div>
            </button>
          ) : (
            <Link
              href="/profile"
              className={`flex flex-col items-center justify-center transition-all active:scale-95 ${isProfileContext ? "text-[#3e5560]" : "text-[#111111]"
                }`}
            >
              <div className={`flex flex-col items-center gap-1.5 px-6 py-2.5 transition-transform ${isProfileContext ? "-translate-y-[2px]" : "translate-y-0"
                }`}>
                <UserAvatar size="w-7 h-7" textClass="text-[11px]" />
                <span className={`text-[12px] font-bold tracking-tight transition-colors ${isProfileContext ? "text-[#3e5560]" : "text-[#111111]"}`}>
                  프로필
                </span>
              </div>
            </Link>
          )}
        </nav>
      ) : null}

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} nextPath={loginNextPath} />
    </>
  );
}

function UserAvatarInner({
  size,
  textClass,
  image,
  name,
}: {
  size: string;
  textClass: string;
  image: string | null;
  name: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const shouldShowImage = Boolean(image) && !imageFailed;

  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-full border border-[#afb3ac]/20 ring-2 ring-transparent transition-all`}>
      {shouldShowImage ? (
        <img
          src={image || ""}
          alt="Profile"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center bg-[#4a626d] text-white font-bold ${textClass}`}>
          {name?.[0] || <UserDefaultIcon className="h-4 w-4" />}
        </div>
      )}
    </div>
  );
}

function NavigationFallback({ hideMobileBottomNav = false }: { hideMobileBottomNav?: boolean }) {
  return (
    <>
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 border-r border-[#afb3ac]/20 bg-[#faf9f5] lg:flex" />
      {!hideMobileBottomNav ? (
      <nav className="fixed bottom-0 left-0 z-50 flex h-[calc(5.8rem+max(env(safe-area-inset-bottom),0.5rem))] w-full bg-white lg:hidden" />
      ) : null}
    </>
  );
}

export default function Navigation({ hideMobileBottomNav = false }: { hideMobileBottomNav?: boolean }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <NavigationFallback hideMobileBottomNav={hideMobileBottomNav} />;
  }

  return (
    <Suspense fallback={<NavigationFallback hideMobileBottomNav={hideMobileBottomNav} />}>
      <NavigationContent hideMobileBottomNav={hideMobileBottomNav} />
    </Suspense>
  );
}
