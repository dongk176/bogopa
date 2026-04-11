"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { NativeChat, type NativeChatPersona } from "@/lib/native-chat";
import {
  clearPersonaArtifacts,
  loadPersonaRuntime,
  savePersonaRuntime,
} from "@/lib/persona/storage";
import { PersonaRuntime } from "@/types/persona";
import { MEMORY_COSTS } from "@/lib/memory-pass/config";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import Navigation from "@/app/_components/Navigation";
import PersonaMemorySheet from "@/app/_components/PersonaMemorySheet";
import MemoryBalanceBadge from "@/app/_components/MemoryBalanceBadge";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";
import useMemoryCreateGuard from "@/app/_components/useMemoryCreateGuard";
import { getConversationTensionGuide } from "@/lib/persona/conversationTension";
import MemoryPassExpiredLockOverlay from "@/app/_components/MemoryPassExpiredLockOverlay";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type StoredChatState = {
  personaId: string;
  personaName?: string;
  avatarUrl?: string;
  isLocked?: boolean;
  runtime?: PersonaRuntime | null;
  messages: ChatMessage[];
  lastMessage?: string;
  updatedAt: string;
};

type ChatDebugCandidate = {
  id: string;
  similarity: number;
  recency: number;
  topicMatch: number;
  emotionMatch: number;
  entityOverlap: number;
  score: number;
  createdAt: string;
  userEmotion: string | null;
  userIntent: string | null;
  topicCategory: string | null;
  entities: string[];
  aiAction: string | null;
  pairText: string;
};

type ChatDebugPayload = {
  retrieval: {
    queryText: string;
    queryMeta: {
      userEmotion: string;
      topicCategory: string;
      entities: string[];
    };
    isReferentialMessage: boolean;
    topSimilarity: number;
    thresholdSimilarity: number;
    thresholdConfidence: number;
    candidates: ChatDebugCandidate[];
    selected: ChatDebugCandidate[];
    error?: string;
  };
  prompt: {
    model: string;
    maxCompletionTokens: number;
    systemPrompt: string;
    history: ChatTurn[];
    retryTriggered: boolean;
    retrySystemPrompt?: string;
  };
  savedMemory: {
    attempted: boolean;
    inserted: boolean;
    skippedReason?: string;
    pairText?: string;
    responseMode?: string[];
    questionUsed?: boolean;
    tone?: string[];
    importance?: number;
    isUnresolved?: boolean;
    userEmotion?: string | null;
    userIntent?: string | null;
    topicCategory?: string | null;
    entities?: string[];
    aiAction?: string | null;
    hasPromise?: boolean;
    embeddingDimension?: number;
    embeddingPreview?: number[];
    error?: string;
  };
};

type Step3AvatarRaw = {
  personaImageUrl?: string;
};

type MemoryStorePrompt = {
  title: string;
  message: string;
  returnTo: string;
};

const CHAT_STATE_KEY_PREFIX = "bogopa_chat_state";
const USER_INPUT_CHAR_LIMIT = 100;
const RECENT_CONTEXT_MESSAGES = 8; // 4 turns
const SHEET_CLOSE_SWIPE_THRESHOLD = 72;

function toId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getChatStateKey(personaId: string) {
  return `${CHAT_STATE_KEY_PREFIX}:${personaId}`;
}

function readStep3AvatarFromStorage() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("bogopa_profile_step3");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Step3AvatarRaw;
    return typeof parsed.personaImageUrl === "string" ? parsed.personaImageUrl.trim() : "";
  } catch {
    return "";
  }
}

function toAbsoluteAvatarUrl(rawValue: string | null | undefined) {
  const raw = String(rawValue || "").trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof window === "undefined") return undefined;
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return undefined;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDateLabel(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

function UserAvatarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.6 19.2a6.4 6.4 0 0 1 12.8 0" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="2.8" width="6" height="12.4" rx="3" />
      <path d="M5 11.8a7 7 0 0 0 14 0" />
      <path d="M12 18.8v3.2" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function DotTyping() {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDotCount((prev) => (prev + 1) % 3);
    }, 240);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="flex h-4 items-center justify-center gap-1.5" aria-label="typing-indicator">
      {[0, 1, 2].map((index) => {
        const active = index === dotCount;
        return (
          <span
            key={index}
            className="h-2 w-2 rounded-full bg-[#6a7480] transition-all duration-200 ease-in-out"
            style={{
              opacity: active ? 1 : 0.35,
              transform: active ? "translateY(-2.5px) scale(1.15)" : "translateY(0) scale(1)",
            }}
          />
        );
      })}
    </div>
  );
}

function ChatLoadingScaffold() {
  return (
    <div className="flex h-dvh overflow-hidden bg-[#faf9f5] font-body text-[#2f342e]">
      <Navigation hideMobileBottomNav />
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:pl-64" />
    </div>
  );
}

function DebugSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-[#d9e2e8] bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-xs font-bold tracking-wide text-[#3e5560]">{title}</h3>
      <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#f7fbfd] p-3 text-[11px] leading-relaxed text-[#2f342e]">
        {body}
      </pre>
    </section>
  );
}


async function fetchFirstGreeting(runtime: PersonaRuntime, alias: string) {
  const styleSummary =
    getConversationTensionGuide((runtime as any)?.style?.politeness || "") ||
    (runtime as any)?.style?.tone?.[0] ||
    (runtime as any)?.style?.replyTempo ||
    "";
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "first_greeting",
      runtime,
      alias,
      styleSummary,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { code?: string };
    return {
      greeting: "",
      requiresConsent: response.status === 403 && payload.code === "AI_DATA_SHARING_CONSENT_REQUIRED",
    };
  }
  const payload = (await response.json()) as { greeting?: string };
  return {
    greeting: payload.greeting?.trim() || "",
    requiresConsent: false,
  };
}

function normalizeAddressAlias(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 1 && (trimmed.endsWith("님") || trimmed.endsWith("씨"))) return trimmed.slice(0, -1);
  if (trimmed.length > 1 && (trimmed.endsWith("야") || trimmed.endsWith("아"))) {
    const base = trimmed.slice(0, -1);
    if (!base) return trimmed;
    if (/[야아]$/.test(base)) return trimmed;
    return base;
  }
  return trimmed;
}

function ChatContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNativeChatRuntime = Capacitor.isNativePlatform();
  const isIosRuntime = isNativeChatRuntime && Capacitor.getPlatform() === "ios";
  const [nativeChatFailed, setNativeChatFailed] = useState(false);
  const shouldUseNativeChatScreen = isIosRuntime && !nativeChatFailed;
  const chatId = searchParams.get("id");
  const [runtime, setRuntime] = useState<PersonaRuntime | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dateLabel, setDateLabel] = useState("");
  const [savedChats, setSavedChats] = useState<StoredChatState[]>([]);
  const [step3AvatarUrl, setStep3AvatarUrl] = useState("");
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);
  const [isMemoryBadgeAnimating, setIsMemoryBadgeAnimating] = useState(false);
  const [isUnlimitedChatActive, setIsUnlimitedChatActive] = useState(false);
  const [unlimitedChatExpiresAt, setUnlimitedChatExpiresAt] = useState<string | null>(null);
  const [showExpiredPrompt, setShowExpiredPrompt] = useState(false);
  const isUnlimitedChatActiveRef = useRef(false);

  useEffect(() => {
    isUnlimitedChatActiveRef.current = isUnlimitedChatActive;
  }, [isUnlimitedChatActive]);

  useEffect(() => {
    if (!isUnlimitedChatActive || !unlimitedChatExpiresAt) return;

    const interval = setInterval(() => {
      const expirationDate = new Date(unlimitedChatExpiresAt).getTime();
      if (Date.now() > expirationDate) {
        setIsUnlimitedChatActive(false);
        setUnlimitedChatExpiresAt(null);
        setShowExpiredPrompt(true);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isUnlimitedChatActive, unlimitedChatExpiresAt]);
  const [isChatListOpen, setIsChatListOpen] = useState(false);
  const [isPersonaSheetOpen, setIsPersonaSheetOpen] = useState(false);
  const [isChatListHandleDragging, setIsChatListHandleDragging] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isNativeChatPresented, setIsNativeChatPresented] = useState(false);
  const [nativeQueuedText, setNativeQueuedText] = useState<string | null>(null);
  const [nativePersonaOverrides, setNativePersonaOverrides] = useState<NativeChatPersona[] | null>(null);
  const [typingBlockedNotice, setTypingBlockedNotice] = useState("");
  const [memoryStorePrompt, setMemoryStorePrompt] = useState<MemoryStorePrompt | null>(null);
  const [lockedPersonaName, setLockedPersonaName] = useState("");
  const [chatDebug, setChatDebug] = useState<ChatDebugPayload | null>(null);
  const { guardCreateStart, modalNode, isChecking } = useMemoryCreateGuard();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const initialMessageRequestIdRef = useRef(0);
  const isComposingRef = useRef(false);

  useNativeSwipeBack(() => {
    router.push("/chat/list");
  });
  const startCreateMemoryFromChat = () => {
    const returnTo = chatId ? `/chat?id=${chatId}` : "/chat";
    void guardCreateStart({
      returnTo,
      onAllowed: () => router.push("/step-1/start"),
    });
  };
  const startCreateMemoryFromChatRef = useRef(startCreateMemoryFromChat);
  useEffect(() => {
    startCreateMemoryFromChatRef.current = startCreateMemoryFromChat;
  }, [startCreateMemoryFromChat]);
  const memoryBalanceRef = useRef<number | null>(null);
  const memoryBadgeAnimTimeoutRef = useRef<number | null>(null);
  const typingBlockedNoticeTimeoutRef = useRef<number | null>(null);
  const chatListSwipeStartYRef = useRef<number | null>(null);
  const chatListSwipeLastYRef = useRef<number | null>(null);
  const keepNativeChatOnNextCleanupRef = useRef(false);

  function triggerMemorySpendAnimation() {
    setIsMemoryBadgeAnimating(true);

    if (memoryBadgeAnimTimeoutRef.current) {
      window.clearTimeout(memoryBadgeAnimTimeoutRef.current);
    }

    memoryBadgeAnimTimeoutRef.current = window.setTimeout(() => {
      setIsMemoryBadgeAnimating(false);
    }, 220);
  }

  useEffect(() => {
    memoryBalanceRef.current = memoryBalance;
  }, [memoryBalance]);

  useEffect(() => {
    return () => {
      if (memoryBadgeAnimTimeoutRef.current) {
        window.clearTimeout(memoryBadgeAnimTimeoutRef.current);
      }
      if (typingBlockedNoticeTimeoutRef.current) {
        window.clearTimeout(typingBlockedNoticeTimeoutRef.current);
      }
    };
  }, []);

  function showTypingBlockedNotice() {
    const personaDisplayName = runtime?.displayName?.trim() || "내 기억";
    setTypingBlockedNotice(`${personaDisplayName}이 입력중에는 메시지를 보낼 수 없습니다.`);
    if (typingBlockedNoticeTimeoutRef.current) {
      window.clearTimeout(typingBlockedNoticeTimeoutRef.current);
    }
    typingBlockedNoticeTimeoutRef.current = window.setTimeout(() => {
      setTypingBlockedNotice("");
    }, 1800);
  }

  async function promptMoveToMemoryStore(personaId: string) {
    const returnTo = `/chat?id=${personaId}`;
    const title = "기억이 부족해요";
    const message = "확인을 누르면 기억 스토어로 이동합니다.";

    if (shouldUseNativeChatScreen) {
      try {
        const result = await NativeChat.confirmMemoryStore({
          title,
          message,
          confirmText: "확인",
          cancelText: "취소",
        });
        if (result?.confirmed) {
          try {
            await Keyboard.hide();
          } catch { }
          try {
            await Keyboard.setResizeMode({ mode: KeyboardResize.None });
          } catch { }
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--bogopa-keyboard-height", "0px");
          }
          router.push(`/payment?returnTo=${encodeURIComponent(returnTo)}`);
        }
        return;
      } catch (error) {
        console.error("[chat] native memory-store confirm failed", error);
      }
    }

    setMemoryStorePrompt({ title, message, returnTo });
  }

  useEffect(() => {
    if (!isNativeChatRuntime) return;
    void Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => { });
    return () => {
      void Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => { });
    };
  }, [isNativeChatRuntime]);

  async function queueInitialAssistantMessage(targetRuntime: PersonaRuntime) {
    const requestId = ++initialMessageRequestIdRef.current;
    const preferredAlias = normalizeAddressAlias((targetRuntime as any)?.addressing?.callsUserAs?.[0] || "") || "너";
    const requestedAt = Date.now();
    setIsTyping(true);

    let first = "";
    let consentRequired = false;
    try {
      const firstAttempt = await fetchFirstGreeting(targetRuntime, preferredAlias);
      first = firstAttempt.greeting;
      if (firstAttempt.requiresConsent) {
        consentRequired = true;
      }
      if (!first) {
        await sleep(120);
        const secondAttempt = await fetchFirstGreeting(targetRuntime, preferredAlias);
        first = secondAttempt.greeting;
        if (secondAttempt.requiresConsent) {
          consentRequired = true;
        }
      }
    } catch (error) {
      console.error("[chat] first greeting generation failed", error);
    }

    if (consentRequired) {
      const returnTo = runtime?.personaId ? `/chat?id=${runtime.personaId}` : "/chat/list";
      router.push(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
      setIsTyping(false);
      return;
    }

    if (!first) {
      first = `${preferredAlias}, 안녕. 잘 지냈어? 오늘은 어땠는지 편하게 들려줘.`;
    }
    first = first.trim();

    const elapsed = Date.now() - requestedAt;
    if (elapsed < 1000) {
      await sleep(1000 - elapsed);
    }

    if (requestId !== initialMessageRequestIdRef.current) return;
    const firstAt = nowIso();
    setMessages([{ id: toId(), role: "assistant", content: first, createdAt: firstAt }]);
    setDateLabel(formatDateLabel(firstAt));
    setIsTyping(false);
  }

  useEffect(() => {
    let cancelled = false;

    const loadMemoryBalance = async () => {
      try {
        const response = await fetch("/api/memory-pass", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setMemoryBalance(Number(data?.memoryBalance ?? 0));
          setIsUnlimitedChatActive(Boolean(data?.isUnlimitedChatActive));
          setUnlimitedChatExpiresAt(data?.unlimitedChatExpiresAt || null);
        }
      } catch {
        if (!cancelled) {
          setMemoryBalance(null);
          setIsUnlimitedChatActive(false);
          setUnlimitedChatExpiresAt(null);
        }
      }
    };

    loadMemoryBalance();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shouldUseNativeChatScreen) {
      setNativePersonaOverrides(null);
      return;
    }

    let cancelled = false;

    const loadNativePersonaOverrides = async () => {
      try {
        const response = await fetch("/api/persona", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setNativePersonaOverrides(null);
          return;
        }

        const data = await response.json();
        if (cancelled) return;

        if (!data?.ok || !Array.isArray(data.personas)) {
          setNativePersonaOverrides(null);
          return;
        }

        const mapped: NativeChatPersona[] = [];
        for (const persona of data.personas as any[]) {
          const personaId = String(persona?.persona_id ?? persona?.personaId ?? "").trim();
          if (!personaId) continue;
          mapped.push({
            personaId,
            personaName: String(persona?.name ?? persona?.personaName ?? "기억").trim() || "기억",
            avatarUrl: toAbsoluteAvatarUrl(persona?.avatar_url ?? persona?.avatarUrl),
            lastMessage:
              String(persona?.last_message_content ?? persona?.lastMessage ?? "").trim(),
          });
        }

        setNativePersonaOverrides(mapped);
      } catch {
        if (!cancelled) {
          setNativePersonaOverrides(null);
        }
      }
    };

    void loadNativePersonaOverrides();

    return () => {
      cancelled = true;
    };
  }, [shouldUseNativeChatScreen, runtime?.personaId]);

  useEffect(() => {
    let cancelled = false;

    // Entering chat should always start from the top of the page viewport.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    // Reset local state for the new session.
    setMessages([]);
    setIsLoaded(false);
    setIsTyping(false);
    setChatDebug(null);

    const searchId = chatId || undefined;
    setStep3AvatarUrl(readStep3AvatarFromStorage());
    let resolvedRuntime = loadPersonaRuntime(searchId);

    const hydrateChat = async () => {
      let fetchedChats: StoredChatState[] = [];
      let didLoadPersonaList = false;
      try {
        const res = await fetch("/api/persona", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        didLoadPersonaList = true;

        if (data.ok && Array.isArray(data.personas)) {
          fetchedChats = data.personas.map((p: any) => {
            const lastActivity = p.session_updated_at && new Date(p.session_updated_at) > new Date(p.updated_at)
              ? p.session_updated_at
              : p.updated_at;
            return {
              personaId: p.persona_id,
              personaName: p.name,
              avatarUrl: p.avatar_url,
              isLocked: Boolean(p.is_locked),
              runtime: p.runtime || null,
              messages: p.last_message_content ? [{ id: "last", role: "assistant", content: p.last_message_content, createdAt: p.updated_at }] : [],
              lastMessage: p.last_message_content || "",
              updatedAt: lastActivity,
            };
          });
          fetchedChats.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
          setSavedChats(fetchedChats);

          if (resolvedRuntime) {
            const runtimeStillExists = fetchedChats.some((chat) => chat.personaId === resolvedRuntime?.personaId);
            if (!runtimeStillExists) {
              window.localStorage.removeItem(getChatStateKey(resolvedRuntime.personaId));
              clearPersonaArtifacts(resolvedRuntime.personaId);
              resolvedRuntime = null;
            }
          }

          if (!chatId) {
            if (fetchedChats.length > 0) {
              router.replace(`/chat?id=${fetchedChats[0].personaId}`);
              return;
            }
          } else {
            const matchedChat = fetchedChats.find((chat) => chat.personaId === chatId);

            if (!matchedChat) {
              if (fetchedChats.length > 0) {
                router.replace(`/chat?id=${fetchedChats[0].personaId}`);
                return;
              }
              resolvedRuntime = null;
            } else if (!resolvedRuntime && matchedChat.runtime) {
              resolvedRuntime = matchedChat.runtime;
              savePersonaRuntime(matchedChat.runtime);
            }
          }
        }
      } catch (err) {
        console.error("[chat] failed to fetch persona list", err);
      }
      if (cancelled) return;

      if (didLoadPersonaList && fetchedChats.length === 0 && resolvedRuntime) {
        window.localStorage.removeItem(getChatStateKey(resolvedRuntime.personaId));
        clearPersonaArtifacts(resolvedRuntime.personaId);
        resolvedRuntime = null;
      }

      setRuntime(resolvedRuntime);

      if (!resolvedRuntime) {
        setIsLoaded(true);
        return;
      }

      let hasDbMessages = false;
      try {
        const res = await fetch(`/api/chat/session?personaId=${resolvedRuntime.personaId}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.ok && data.messages.length > 0) {
          hasDbMessages = true;
          setMessages(data.messages);
          setDateLabel(formatDateLabel(data.messages[0].createdAt));
        }
      } catch (err) {
        console.error("[chat] failed to load from db", err);
      }

      if (!hasDbMessages) {
        void queueInitialAssistantMessage(resolvedRuntime);
      }

      setIsLoaded(true);
    };

    void hydrateChat();

    return () => {
      cancelled = true;
    };
  }, [chatId, router]);

  useEffect(() => {
    return () => {
      initialMessageRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [(runtime as any)?.avatarUrl, step3AvatarUrl]);

  const scrollChatToBottom = (behavior: ScrollBehavior = "auto", force = false) => {
    const container = chatScrollRef.current;
    if (!container) return;

    const canScroll = container.scrollHeight > container.clientHeight + 2;
    if (!force && !canScroll) return;

    const nextTop = Math.max(container.scrollHeight - container.clientHeight, 0);
    container.scrollTo({ top: nextTop, behavior });
  };

  useEffect(() => {
    scrollChatToBottom("auto");
  }, [messages, isTyping]);

  useEffect(() => {
    if (!isComposerFocused) return;
    const delays = [0, 40];
    const ids = delays.map((delay) => window.setTimeout(() => scrollChatToBottom("auto"), delay));
    return () => {
      ids.forEach((id) => window.clearTimeout(id));
    };
  }, [isComposerFocused, messages.length, isTyping]);

  useEffect(() => {
    if (!isComposerFocused) return;
    const onViewportChanged = () => {
      scrollChatToBottom("auto");
    };
    window.addEventListener("resize", onViewportChanged);
    window.visualViewport?.addEventListener("resize", onViewportChanged);
    window.visualViewport?.addEventListener("scroll", onViewportChanged);
    return () => {
      window.removeEventListener("resize", onViewportChanged);
      window.visualViewport?.removeEventListener("resize", onViewportChanged);
      window.visualViewport?.removeEventListener("scroll", onViewportChanged);
    };
  }, [isComposerFocused]);

  useEffect(() => {
    if (isChatListOpen) return;
    setIsChatListHandleDragging(false);
    chatListSwipeStartYRef.current = null;
    chatListSwipeLastYRef.current = null;
  }, [isChatListOpen]);

  useEffect(() => {
    if (!runtime) return;
    const stateKey = getChatStateKey(runtime.personaId);
    const payload: StoredChatState = {
      personaId: runtime.personaId,
      personaName: runtime.displayName || "알 수 없음",
      avatarUrl: (runtime as any)?.avatarUrl || step3AvatarUrl || "",
      messages,
      updatedAt: nowIso(),
    };
    window.localStorage.setItem(stateKey, JSON.stringify(payload));
  }, [runtime, messages, step3AvatarUrl]);

  const placeholder = useMemo(() => {
    if (!runtime) return "분석 결과를 먼저 생성해주세요.";
    return `${runtime.displayName}에게 메시지를 보내보세요...`;
  }, [runtime]);

  const memoryCount = useMemo(() => {
    if (!runtime) return 0;
    const anchorCount = ((runtime as any)?.memories || []).length;
    const phraseCount = ((runtime as any)?.expressions?.frequentPhrases || []).length;
    return anchorCount * 10 + phraseCount;
  }, [runtime]);

  const retrievalDebugText = useMemo(() => {
    if (!chatDebug) return "아직 디버그 데이터가 없습니다.";
    return JSON.stringify(chatDebug.retrieval, null, 2);
  }, [chatDebug]);

  const promptDebugText = useMemo(() => {
    if (!chatDebug) return "아직 디버그 데이터가 없습니다.";
    return JSON.stringify(chatDebug.prompt, null, 2);
  }, [chatDebug]);

  const savedMemoryDebugText = useMemo(() => {
    if (!chatDebug) return "아직 디버그 데이터가 없습니다.";
    return JSON.stringify(chatDebug.savedMemory, null, 2);
  }, [chatDebug]);

  const nativeAvatarUrl = useMemo(() => {
    if (!runtime) return undefined;
    return toAbsoluteAvatarUrl((runtime as any)?.avatarUrl || step3AvatarUrl || "");
  }, [runtime, step3AvatarUrl]);

  const nativePersonaList = useMemo(() => {
    const baseList =
      nativePersonaOverrides && nativePersonaOverrides.length > 0
        ? nativePersonaOverrides
        : savedChats.map((chat) => ({
          personaId: chat.personaId,
          personaName: chat.personaName || "기억",
          avatarUrl: toAbsoluteAvatarUrl(chat.avatarUrl),
          lastMessage: chat.lastMessage || "",
        }));

    const deduped: NativeChatPersona[] = [];
    const seenPersonaIds = new Set<string>();
    for (const persona of baseList) {
      const personaId = String(persona.personaId || "").trim();
      if (!personaId || seenPersonaIds.has(personaId)) continue;
      seenPersonaIds.add(personaId);
      deduped.push({
        personaId,
        personaName: String(persona.personaName || "기억").trim() || "기억",
        avatarUrl: toAbsoluteAvatarUrl(persona.avatarUrl),
        lastMessage: String(persona.lastMessage || ""),
      });
    }

    if (runtime) {
      const currentPersonaId = String(runtime.personaId || "").trim();
      if (currentPersonaId && !seenPersonaIds.has(currentPersonaId)) {
        deduped.unshift({
          personaId: currentPersonaId,
          personaName: runtime.displayName || "기억",
          avatarUrl: nativeAvatarUrl,
          lastMessage: "",
        });
      }
    }

    return deduped;
  }, [nativePersonaOverrides, savedChats, runtime, nativeAvatarUrl]);

  const nativeChatStatePayload = useMemo(() => {
    if (!runtime) return null;
    return {
      personaId: runtime.personaId,
      personaName: runtime.displayName || "페르소나",
      avatarUrl: nativeAvatarUrl,
      personas: nativePersonaList,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
      isTyping,
      memoryBalance,
    };
  }, [runtime, nativeAvatarUrl, nativePersonaList, messages, isTyping, memoryBalance]);

  function handleChatListSwipeStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    chatListSwipeStartYRef.current = y;
    chatListSwipeLastYRef.current = y;
    setIsChatListHandleDragging(true);
  }

  function handleChatListSwipeMove(event: TouchEvent<HTMLDivElement>) {
    if (!isChatListHandleDragging || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    chatListSwipeLastYRef.current = y;
    if (y > (chatListSwipeStartYRef.current ?? y)) {
      event.preventDefault();
    }
  }

  function handleChatListSwipeEnd() {
    const startY = chatListSwipeStartYRef.current;
    const endY = chatListSwipeLastYRef.current;
    const deltaY = startY !== null && endY !== null ? endY - startY : 0;

    setIsChatListHandleDragging(false);
    chatListSwipeStartYRef.current = null;
    chatListSwipeLastYRef.current = null;

    if (deltaY > SHEET_CLOSE_SWIPE_THRESHOLD) {
      setIsChatListOpen(false);
    }
  }

  async function submitUserText(rawText: string) {
    const trimmed = rawText.slice(0, USER_INPUT_CHAR_LIMIT).trim();
    if (!trimmed || !runtime) return;
    const activeChat = savedChats.find((chat) => chat.personaId === runtime.personaId);
    if (activeChat?.isLocked) {
      setLockedPersonaName(runtime.displayName || activeChat.personaName || "이 기억");
      return;
    }
    if (isTyping) {
      showTypingBlockedNotice();
      return;
    }
    if (memoryBalanceRef.current === null) {
      try {
        const balanceResponse = await fetch("/api/memory-pass", { cache: "no-store" });
        if (balanceResponse.ok) {
          const balancePayload = await balanceResponse.json().catch(() => ({} as any));
          const latestBalance = Number(balancePayload?.memoryBalance ?? 0);
          memoryBalanceRef.current = latestBalance;
          setMemoryBalance(latestBalance);
          isUnlimitedChatActiveRef.current = Boolean(balancePayload?.isUnlimitedChatActive);
        }
      } catch {
        // Ignore preflight errors and keep server-side guard as source of truth.
      }
    }
    if (
      !isUnlimitedChatActiveRef.current &&
      typeof memoryBalanceRef.current === "number" &&
      memoryBalanceRef.current < MEMORY_COSTS.chat
    ) {
      await promptMoveToMemoryStore(runtime.personaId);
      return;
    }

    const previousMessages = messages;
    const previousBalance = memoryBalanceRef.current;
    const userAt = nowIso();
    const userMessage: ChatMessage = { id: toId(), role: "user", content: trimmed, createdAt: userAt };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);
    const startedAt = Date.now();
    let usedOptimisticSpend = false;
    if (!isUnlimitedChatActiveRef.current && typeof memoryBalanceRef.current === "number") {
      const nextBalance = Math.max(memoryBalanceRef.current - MEMORY_COSTS.chat, 0);
      memoryBalanceRef.current = nextBalance;
      setMemoryBalance(nextBalance);
      triggerMemorySpendAnimation();
      usedOptimisticSpend = true;
    }

    try {
      const historyForReply: ChatTurn[] = nextMessages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({ role: message.role, content: message.content }))
        .slice(-RECENT_CONTEXT_MESSAGES);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          runtime,
          messages: historyForReply,
        }),
      });

      let replyText = "";
      let nextBalanceFromServer: number | null = null;
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
        if (response.status === 403 && body.code === "AI_DATA_SHARING_CONSENT_REQUIRED") {
          setMessages(previousMessages);
          if (!shouldUseNativeChatScreen) {
            setInput(trimmed);
          }
          if (typeof previousBalance === "number") {
            memoryBalanceRef.current = previousBalance;
            setMemoryBalance(previousBalance);
          }
          const returnTo = runtime?.personaId ? `/chat?id=${runtime.personaId}` : "/chat/list";
          router.push(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
          return;
        }
        if (response.status === 403 && body.code === "MEMORY_PASS_EXPIRED_LOCKED_PERSONA") {
          setMessages(previousMessages);
          if (!shouldUseNativeChatScreen) {
            setInput(trimmed);
          }
          if (typeof previousBalance === "number") {
            memoryBalanceRef.current = previousBalance;
            setMemoryBalance(previousBalance);
          }
          setLockedPersonaName(runtime.displayName || "이 기억");
          return;
        }
        if (response.status === 402 || body.code === "MEMORY_INSUFFICIENT") {
          setMessages(previousMessages);
          if (!shouldUseNativeChatScreen) {
            setInput(trimmed);
          }
          if (typeof previousBalance === "number") {
            memoryBalanceRef.current = previousBalance;
            setMemoryBalance(previousBalance);
          }
          await promptMoveToMemoryStore(runtime.personaId);
          return;
        }
      } else {
        const payload = (await response.json()) as {
          reply?: string;
          memoryBalance?: number;
          debug?: ChatDebugPayload;
        };
        replyText = (payload.reply || "").trim();
        if (typeof payload.memoryBalance === "number") {
          nextBalanceFromServer = payload.memoryBalance;
        }
        setChatDebug(payload.debug || null);
      }

      if (!replyText) {
        throw new Error("AI 응답을 생성하지 못했습니다.");
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < 650) {
        await sleep(650 - elapsed);
      }

      const aiAt = nowIso();
      const aiMessage: ChatMessage = { id: toId(), role: "assistant", content: replyText, createdAt: aiAt };
      setMessages((prev) => [...prev, aiMessage]);

      if (typeof nextBalanceFromServer === "number") {
        memoryBalanceRef.current = nextBalanceFromServer;
        setMemoryBalance(nextBalanceFromServer);
        if (!usedOptimisticSpend) {
          triggerMemorySpendAnimation();
        }
      }
    } catch (error) {
      console.error("[chat] submission failed", error);
    } finally {
      setIsTyping(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposingRef.current) return;
    if (isTyping) {
      showTypingBlockedNotice();
      return;
    }
    await submitUserText(input);
  }

  useEffect(() => {
    if (!nativeQueuedText) return;
    void submitUserText(nativeQueuedText);
    setNativeQueuedText(null);
  }, [nativeQueuedText]);

  useEffect(() => {
    if (!shouldUseNativeChatScreen || !isLoaded || !runtime) return;

    let isActive = true;
    let sendListener: { remove: () => Promise<void> } | null = null;
    let closeListener: { remove: () => Promise<void> } | null = null;
    let selectPersonaListener: { remove: () => Promise<void> } | null = null;
    let createMemoryListener: { remove: () => Promise<void> } | null = null;

    const openNativeChat = async () => {
      try {
        sendListener = await NativeChat.addListener("sendMessage", ({ text }) => {
          const trimmed = typeof text === "string" ? text.trim() : "";
          if (!trimmed) return;
          setNativeQueuedText(trimmed);
        });
        closeListener = await NativeChat.addListener("close", () => {
          router.push("/chat/list");
        });
        selectPersonaListener = await NativeChat.addListener("selectPersona", ({ personaId }) => {
          const targetId = typeof personaId === "string" ? personaId.trim() : "";
          if (!targetId || targetId === runtime.personaId) return;
          keepNativeChatOnNextCleanupRef.current = true;
          setIsChatListOpen(false);
          router.replace(`/chat?id=${encodeURIComponent(targetId)}`);
        });
        createMemoryListener = await NativeChat.addListener("createMemory", () => {
          startCreateMemoryFromChatRef.current();
        });

        const presentPayload = {
          personaId: runtime.personaId,
          personaName: runtime.displayName || "페르소나",
          avatarUrl: nativeAvatarUrl,
          personas: nativePersonaList,
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          })),
          isTyping,
          memoryBalance,
        };

        await Promise.race([
          NativeChat.present(presentPayload),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("NativeChat present timeout")), 1500),
          ),
        ]);
        if (isActive) {
          setIsNativeChatPresented(true);
        }
      } catch (error) {
        console.error("[chat] failed to present native chat", error);
        if (isActive) {
          setNativeChatFailed(true);
        }
      }
    };

    void openNativeChat();

    return () => {
      isActive = false;
      setIsNativeChatPresented(false);
      if (sendListener) {
        void sendListener.remove();
      }
      if (closeListener) {
        void closeListener.remove();
      }
      if (selectPersonaListener) {
        void selectPersonaListener.remove();
      }
      if (createMemoryListener) {
        void createMemoryListener.remove();
      }
      if (keepNativeChatOnNextCleanupRef.current) {
        keepNativeChatOnNextCleanupRef.current = false;
      } else {
        void NativeChat.dismiss().catch(() => { });
      }
    };
  }, [shouldUseNativeChatScreen, isLoaded, runtime?.personaId, router]);

  useEffect(() => {
    if (!shouldUseNativeChatScreen || !isNativeChatPresented || !nativeChatStatePayload) return;
    void NativeChat.sync(nativeChatStatePayload).catch((error) => {
      console.error("[chat] failed to sync native chat state", error);
    });
  }, [shouldUseNativeChatScreen, isNativeChatPresented, nativeChatStatePayload]);

  const chatLayoutPaddingClass = savedChats.length > 0 ? "lg:pl-[34rem]" : "lg:pl-64";
  const shouldHideMobileBottomNav = true;
  const chatSectionStyle = {
    paddingBottom: isNativeChatRuntime
      ? "calc(6.25rem + env(safe-area-inset-bottom))"
      : "calc(var(--bogopa-keyboard-height, 0px) + 6.25rem + env(safe-area-inset-bottom))",
    scrollPaddingBottom: isNativeChatRuntime
      ? "calc(7.5rem + env(safe-area-inset-bottom))"
      : "calc(var(--bogopa-keyboard-height, 0px) + 7.5rem + env(safe-area-inset-bottom))",
  } as const;
  const chatFooterStyle = {
    bottom: isNativeChatRuntime ? 0 : "var(--bogopa-keyboard-height, 0px)",
    paddingBottom: `calc(0.75rem + max(env(safe-area-inset-bottom), 0.5rem))`,
  } as const;

  if (!isLoaded) {
    return <ChatLoadingScaffold />;
  }

  if (!runtime) {
    if (savedChats.length > 0) {
      return (
        <div className="flex h-dvh overflow-hidden bg-[#faf9f5] font-body text-[#2f342e]">
          <Navigation hideMobileBottomNav={shouldHideMobileBottomNav} />
          <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${chatLayoutPaddingClass}`}>
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-[calc(5.5rem+max(env(safe-area-inset-bottom),0.5rem))] text-center lg:pb-0">
              <div className="max-w-md rounded-3xl border border-[#afb3ac]/20 bg-white p-8 shadow-sm">
                <p className="mb-2 font-headline text-2xl font-bold text-[#4a626d]">대화를 불러오는 중 문제가 생겼어요</p>
                <p className="mb-6 text-sm text-[#5d605a]">저장된 대화 목록에서 다시 선택해 주세요.</p>
                <Link
                  href="/chat/list"
                  className="inline-flex items-center justify-center rounded-full bg-[#4a626d] px-5 py-3 text-sm font-semibold text-[#f0f9ff]"
                >
                  대화 목록 보기
                </Link>
              </div>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="flex h-dvh overflow-hidden bg-[#faf9f5] font-body text-[#2f342e]">
        <Navigation hideMobileBottomNav={shouldHideMobileBottomNav} />
        <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${chatLayoutPaddingClass}`}>
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-[calc(5.5rem+max(env(safe-area-inset-bottom),0.5rem))] text-center lg:pb-0">
            <div className="max-w-md rounded-3xl border border-[#afb3ac]/20 bg-white p-8 shadow-sm">
              <p className="mb-2 font-headline text-2xl font-bold text-[#4a626d]">새로운 기억을 만들어 대화를 시작하세요.</p>
              <button
                type="button"
                onClick={startCreateMemoryFromChat}
                disabled={isChecking}
                className="inline-flex items-center justify-center rounded-full bg-[#4a626d] px-5 py-3 text-sm font-semibold text-[#f0f9ff] disabled:cursor-not-allowed disabled:opacity-70"
              >
                새로운 기억 만들기
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (shouldUseNativeChatScreen) {
    return (
      <div className="flex h-dvh overflow-hidden bg-[#faf9f5] font-body text-[#2f342e]">
        <Navigation hideMobileBottomNav={shouldHideMobileBottomNav} />
        <main className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${chatLayoutPaddingClass}`} />
        {memoryStorePrompt ? (
          <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm">
            <section className="w-full max-w-xs rounded-3xl bg-white px-6 py-6 text-center shadow-2xl">
              <h3 className="font-headline text-lg font-bold text-[#2f342e]">{memoryStorePrompt.title}</h3>
              <p className="mt-2 text-sm text-[#5d605a]">{memoryStorePrompt.message}</p>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMemoryStorePrompt(null)}
                  className="rounded-xl border border-[#d9dde1] bg-white px-4 py-2.5 text-sm font-semibold text-[#4b5563]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = memoryStorePrompt.returnTo;
                    setMemoryStorePrompt(null);
                    router.push(`/payment?returnTo=${encodeURIComponent(target)}`);
                  }}
                  className="rounded-xl bg-[#3e5560] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  확인
                </button>
              </div>
            </section>
          </div>
        ) : null}
        <MemoryPassExpiredLockOverlay
          open={Boolean(lockedPersonaName)}
          onClose={() => setLockedPersonaName("")}
          returnTo={runtime ? `/chat?id=${runtime.personaId}` : "/chat/list"}
          title="기억 패스가 만료되었어요"
          description={`"${lockedPersonaName || "이름"}"의 대화는 현재 잠금 상태입니다.\n구독하면 바로 다시 대화할 수 있어요.`}
          onSubscribed={() => {
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          }}
        />
        {modalNode}
      </div>
    );
  }

  const personaName = runtime.displayName || "페르소나";
  const rawAvatarUrl = (runtime as any)?.avatarUrl || step3AvatarUrl || null;
  const avatarUrl =
    rawAvatarUrl && rawAvatarUrl.includes("amazonaws.com")
      ? `/api/image-proxy?url=${encodeURIComponent(rawAvatarUrl)}`
      : rawAvatarUrl;
  const showAvatarImage = Boolean(avatarUrl) && !avatarLoadError;

  const handlePersonaRuntimeSaved = (nextRuntime: PersonaRuntime) => {
    setRuntime(nextRuntime);
    savePersonaRuntime(nextRuntime);
    setSavedChats((prev) =>
      prev.map((chat) =>
        chat.personaId === nextRuntime.personaId
          ? { ...chat, personaName: nextRuntime.displayName || chat.personaName, runtime: nextRuntime }
          : chat,
      ),
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[#faf9f5] font-body text-[#2f342e]">
      <Navigation hideMobileBottomNav={shouldHideMobileBottomNav} />

      <main className={`relative flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden xl:pr-[27rem] ${chatLayoutPaddingClass}`}>
        {/* Mobile Chat Header (Specific to this chat) */}
        <header className="chat-header-divider fixed top-0 left-0 right-0 z-30 w-full bg-white pt-[var(--native-safe-top)] lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/chat/list")}
                className="mr-1 rounded-xl p-1 text-[#3e5560] hover:bg-[#f4f8fa]"
              >
                <ArrowLeftIcon />
              </button>
              <button
                onClick={() => setIsChatListOpen(true)}
                className="flex items-center gap-3 active:scale-95 transition-transform"
              >
                <div className="h-9 w-9 overflow-hidden rounded-xl bg-black/5">
                  {showAvatarImage ? (
                    <img src={avatarUrl || ""} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[#e6e9e2] text-[#4a626d]">
                      <UserAvatarIcon />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="font-headline text-base font-bold text-[#2f342e]">{personaName}</p>
                  <ChevronDownIcon className="h-4 w-4 text-[#3e5560]" />
                </div>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <MemoryBalanceBadge
                memoryBalance={memoryBalance}
                isAnimating={isMemoryBadgeAnimating}
                showBorder={false}
              />
            </div>
          </div>
        </header>

        <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden px-4 pt-[calc(4rem+var(--native-safe-top))] md:px-6 lg:pt-0">
          {/* Desktop Chat Header */}
          <header className="hidden items-center justify-between px-2 py-6 lg:flex">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 overflow-hidden rounded-3xl bg-black/5">
                {showAvatarImage ? (
                  <img src={avatarUrl || ""} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[#e6e9e2] text-[#4a626d]">
                    <UserAvatarIcon />
                  </div>
                )}
              </div>
              <h1 className="font-headline text-xl font-bold tracking-tight text-[#2f342e]">{personaName}</h1>
            </div>
            <div className="flex items-center gap-2">
              <MemoryBalanceBadge
                memoryBalance={memoryBalance}
                isAnimating={isMemoryBadgeAnimating}
                showBorder={false}
              />
            </div>
          </header>

          <section
            ref={chatScrollRef}
            className="hide-scrollbar flex-1 space-y-8 overflow-y-auto px-2 pt-4 lg:pt-0"
            style={chatSectionStyle}
          >
            <div className="flex justify-center">
              <span className="px-1 py-1 text-[11px] font-semibold tracking-wide text-[#2f342e]">
                {dateLabel || formatDateLabel(nowIso())}
              </span>
            </div>

            {messages.map((message) => {
              if (message.role === "assistant") {
                return (
                  <div key={message.id} className="flex items-start gap-3">
                    <div className="pt-1">
                      <div className="h-8 w-8 overflow-hidden rounded-full">
                        {showAvatarImage ? (
                          <img
                            src={avatarUrl || ""}
                            alt="페르소나"
                            className="h-full w-full object-cover"
                            onError={() => setAvatarLoadError(true)}
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-[#e6e9e2] text-[#4a626d]">
                            <UserAvatarIcon />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="max-w-[85%]">
                      <div className="rounded-3xl rounded-tl-sm bg-[#e3e8eb] p-5">
                        <p className="whitespace-pre-line text-[15px] leading-relaxed text-[#2f342e]">{message.content}</p>
                      </div>
                      <span className="ml-1 mt-2 block text-[10px] text-[#2f342e]">{formatTime(message.createdAt)}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className="flex flex-col items-end gap-1">
                  <div className="max-w-[85%]">
                    <div className="rounded-3xl rounded-tr-sm bg-[#cde6f4] p-5 shadow-sm">
                      <p className="text-[15px] font-medium leading-relaxed text-[#111827]">{message.content}</p>
                    </div>
                  </div>
                  <span className="mr-1 mt-1 text-[11px] font-medium text-[#64748b]">{formatTime(message.createdAt)}</span>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 overflow-hidden rounded-full">
                  {showAvatarImage ? (
                    <img src={avatarUrl || ""} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[#e6e9e2] text-[#4a626d]">
                      <UserAvatarIcon />
                    </div>
                  )}
                </div>
                <div className="inline-flex w-fit items-center justify-center rounded-3xl rounded-tl-sm bg-[#e3e8eb] px-4 py-3 shadow-sm">
                  <DotTyping />
                </div>
              </div>
            )}
            <div ref={chatEndRef} className="h-10" />
          </section>

          <footer
            className="absolute bottom-0 left-0 right-0 z-20 border-t border-[#dfe4e7] bg-white/95 px-4 pt-3 backdrop-blur-md lg:static lg:z-auto lg:border-t-0 lg:bg-transparent lg:px-0 lg:pt-4 lg:backdrop-blur-0 lg:pb-8"
            style={chatFooterStyle}
          >
            <div className="mx-auto w-full max-w-3xl">
              <form onSubmit={handleSubmit} className="relative flex items-end gap-2 lg:px-2">
                <div className="relative flex-1 flex items-center rounded-[2rem] bg-[#f8fbfd] focus-within:ring-2 focus-within:ring-[#3e5560]/20 transition-all">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => setIsComposerFocused(true)}
                    onBlur={() => setIsComposerFocused(false)}
                    onCompositionStart={() => {
                      isComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      isComposingRef.current = false;
                    }}
                    enterKeyHint="enter"
                    placeholder={placeholder}
                    className="w-full max-h-32 resize-none border-none bg-transparent p-4 pl-6 pr-14 text-[16px] leading-relaxed text-[#2f342e] outline-none transition-all font-body"
                    rows={1}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="absolute inset-y-0 right-2 my-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#3e5560] text-[#ffffff] transition-all hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-30"
                  >
                    <SendIcon />
                  </button>
                </div>
              </form>
              <p className="mt-3 text-center text-[10px] font-medium text-[#afb3ac] hidden lg:block">
                {personaName}가 {memoryCount}개의 정리된 기억을 바탕으로 답장을 준비하고 있어요.
              </p>
            </div>
          </footer>
        </div>

        <aside className="hidden xl:flex xl:absolute xl:bottom-6 xl:right-6 xl:top-6 xl:z-10 xl:w-[25rem] xl:flex-col xl:gap-3 xl:overflow-hidden">
          <div className="rounded-2xl border border-[#d5e0e6] bg-[#eef5f9] px-4 py-3 text-xs font-semibold text-[#34505d]">
            디버그 패널 (데스크탑 전용)
          </div>
          <DebugSection title="벡터 검색 결과" body={retrievalDebugText} />
          <DebugSection title="일반 대화 입력 프롬프트" body={promptDebugText} />
          <DebugSection title="방금 저장된 벡터 메타" body={savedMemoryDebugText} />
        </aside>
      </main>

      {typingBlockedNotice ? (
        <div className="pointer-events-none fixed inset-0 z-[180] flex items-center justify-center px-6">
          <div className="rounded-2xl bg-[#2f342e]/92 px-5 py-3 text-center text-sm font-semibold text-white shadow-2xl">
            {typingBlockedNotice}
          </div>
        </div>
      ) : null}

      {showExpiredPrompt ? (
        <div className="fixed inset-0 z-[181] flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-[2rem] bg-white p-8 text-center shadow-2xl animate-fade-in">
            <h3 className="font-headline text-xl font-bold text-[#2f342e]">무제한 대화 이용권 종료</h3>
            <p className="mt-4 text-sm leading-relaxed text-[#5d605a]">
              이용권 시간이 종료되었습니다.<br />
              계속 기억 소모 없이 대화하시려면 연장해 주세요.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowExpiredPrompt(false)}
                className="rounded-2xl border border-[#d9dde1] bg-white px-4 py-3.5 text-sm font-semibold text-[#4b5563] hover:bg-[#f3f4f6] transition-colors"
              >
                나중에 하기
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExpiredPrompt(false);
                  router.push(`/payment?returnTo=${encodeURIComponent(`/chat?id=${runtime?.personaId || ""}`)}`);
                }}
                className="rounded-2xl bg-[#4a626d] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#4a626d]/20 hover:bg-[#3e5661] transition-colors"
              >
                연장하기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {memoryStorePrompt ? (
        <div className="fixed inset-0 z-[181] flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm">
          <section className="w-full max-w-xs rounded-3xl bg-white px-6 py-6 text-center shadow-2xl">
            <h3 className="font-headline text-lg font-bold text-[#2f342e]">{memoryStorePrompt.title}</h3>
            <p className="mt-2 text-sm text-[#5d605a]">{memoryStorePrompt.message}</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMemoryStorePrompt(null)}
                className="rounded-xl border border-[#d9dde1] bg-white px-4 py-2.5 text-sm font-semibold text-[#4b5563]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = memoryStorePrompt.returnTo;
                  setMemoryStorePrompt(null);
                  router.push(`/payment?returnTo=${encodeURIComponent(target)}`);
                }}
                className="rounded-xl bg-[#3e5560] px-4 py-2.5 text-sm font-semibold text-white"
              >
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <MemoryPassExpiredLockOverlay
        open={Boolean(lockedPersonaName)}
        onClose={() => setLockedPersonaName("")}
        returnTo={runtime ? `/chat?id=${runtime.personaId}` : "/chat/list"}
        title="기억 패스가 만료되었어요"
        description={`"${lockedPersonaName || "이름"}"의 대화는 현재 잠금 상태입니다.\n구독하면 바로 다시 대화할 수 있어요.`}
        onSubscribed={() => {
          if (typeof window !== "undefined") {
            window.location.reload();
          }
        }}
      />

      <PersonaMemorySheet
        open={isPersonaSheetOpen}
        runtime={runtime}
        avatarUrl={rawAvatarUrl}
        onClose={() => setIsPersonaSheetOpen(false)}
        onRuntimeSaved={handlePersonaRuntimeSaved}
      />

      {/* Mobile Chat List Bottom Sheet */}
      {isChatListOpen && (
        <div className="fixed inset-0 z-[150] lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setIsChatListOpen(false)} />
          <div className="absolute bottom-0 left-0 w-full max-h-[70vh] rounded-t-[2.5rem] bg-[#242926] p-6 pb-12 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] animate-slide-up flex flex-col border-t border-white/5">
            <div
              className="mx-auto mb-6 flex w-full shrink-0 touch-none justify-center"
              onTouchStart={handleChatListSwipeStart}
              onTouchMove={handleChatListSwipeMove}
              onTouchEnd={handleChatListSwipeEnd}
              onTouchCancel={handleChatListSwipeEnd}
            >
              <div
                className={`h-1 rounded-full transition-all ${isChatListHandleDragging ? "w-16 bg-white/35" : "w-12 bg-white/10"
                  }`}
              />
            </div>

            <h3 className="mb-6 font-headline text-xl font-bold text-[#f0f5f2] px-2 text-center">대화 상대 바꾸기</h3>

            <div className="overflow-y-auto max-h-[360px] space-y-2 px-1 hide-scrollbar">
              {savedChats.map((chat) => (
                <button
                  key={chat.personaId}
                  onClick={() => {
                    setIsChatListOpen(false);
                    router.push(`/chat?id=${chat.personaId}`);
                  }}
                  className={`flex w-full items-center gap-4 rounded-2xl p-4 transition-all active:scale-[0.98] ${chatId === chat.personaId ? "bg-white/10 ring-1 ring-white/10" : "hover:bg-white/5"}`}
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white/5">
                    {chat.avatarUrl ? (
                      <img
                        src={chat.avatarUrl.includes("amazonaws.com") ? `/api/image-proxy?url=${encodeURIComponent(chat.avatarUrl)}` : chat.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/5 text-[#f0f5f2]">
                        <UserAvatarIcon />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className={`truncate text-base font-bold text-[#f0f5f2] ${chatId === chat.personaId ? "text-white" : ""}`}>{chat.personaName}</p>
                    <p className="truncate text-xs text-[#5d605a] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                      {chat.lastMessage || "새로운 대화"}
                    </p>
                  </div>
                  {chatId === chat.personaId && (
                    <div className="h-2 w-2 rounded-full bg-[#4a626d]" />
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={startCreateMemoryFromChat}
              disabled={isChecking}
              className="mt-6 flex items-center justify-center gap-2 rounded-2xl border-2 border-[#3e5560] py-4 text-sm font-bold text-[#111111] active:bg-black/5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span>새로운 기억 만들기</span>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>
      )}
      {modalNode}
    </div>
  );
}

import { Suspense } from "react";

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatLoadingScaffold />}>
      <ChatContainer />
    </Suspense>
  );
}
