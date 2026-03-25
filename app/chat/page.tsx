"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  runtime?: PersonaRuntime | null;
  messages: ChatMessage[];
  lastMessage?: string;
  memorySummary: string;
  unsummarizedTurns: ChatTurn[];
  userTurnCount: number;
  updatedAt: string;
};

type Step3AvatarRaw = {
  personaImageUrl?: string;
};

const CHAT_STATE_KEY_PREFIX = "bogopa_chat_state";
const USER_INPUT_CHAR_LIMIT = 100;
const RECENT_CONTEXT_MESSAGES = 8; // 4 turns
const COMPRESSION_MIN_USER_TURNS = 10;
const COMPRESSION_TRIGGER_TOKENS = 2600;
const TOKEN_ESTIMATE_CHAR_RATIO = 0.7;
const ONBOARDING_STORAGE_KEYS = [
  "bogopa_profile_step1",
  "bogopa_profile_step2",
  "bogopa_profile_step3",
  "bogopa_profile_step4",
  "bogopa_onboarding_session_id",
];

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

function maskDisplayName(name: string) {
  const compact = name.replace(/\s+/g, "").trim();
  if (!compact) return "익*명";
  if (compact.length === 1) return `${compact}*`;
  if (compact.length === 2) return `${compact[0]}*`;
  return `${compact[0]}*${compact[compact.length - 1]}`;
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function estimateTokenCountFromText(text: string) {
  if (!text) return 0;
  return Math.ceil(text.length * TOKEN_ESTIMATE_CHAR_RATIO);
}

function estimateTokenCountFromTurns(turns: ChatTurn[]) {
  return turns.reduce((sum, turn) => sum + estimateTokenCountFromText(turn.content) + 8, 0);
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function UserAvatarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.6 19.2a6.4 6.4 0 0 1 12.8 0" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="5" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="12" cy="19" r="1.2" />
    </svg>
  );
}

function MoreVerticalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
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
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
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

function MemoryMarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.4v4.2l2.7 1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

type MemoryBalanceBadgeProps = {
  memoryBalance: number | null;
  isAnimating: boolean;
};

function MemoryBalanceBadge({
  memoryBalance,
  isAnimating,
}: MemoryBalanceBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[#f0f5f2] transition-colors duration-200 ${
        isAnimating
          ? "border-[#7fa4b6]/35 bg-[#34403b]"
          : "border-white/10 bg-[#303733]"
      }`}
    >
      <MemoryMarkIcon className="h-5 w-5 text-[#bfe4f5]" />
      <span className="text-sm font-extrabold leading-none">{memoryBalance === null ? "..." : formatNumber(memoryBalance)}</span>
    </div>
  );
}

function DotTyping() {
  return (
    <div className="flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#655d5a]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#655d5a] [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#655d5a] [animation-delay:-0.3s]" />
    </div>
  );
}

function ChatLoadingScaffold() {
  return (
    <div className="flex h-dvh overflow-hidden bg-[#faf9f5] font-body text-[#2f342e]">
      <Navigation />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300 lg:pl-64">
        <div className="flex min-h-0 flex-1 items-center justify-center pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
        </div>
      </main>
    </div>
  );
}

async function fetchFirstGreeting(runtime: PersonaRuntime, alias: string) {
  const styleSummary =
    (runtime as any)?.style?.tone?.[0] ||
    (runtime as any)?.style?.politeness ||
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

  if (!response.ok) return "";
  const payload = (await response.json()) as { greeting?: string };
  return payload.greeting?.trim() || "";
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
  const chatId = searchParams.get("id");
  const { data: session } = useSession();
  const [runtime, setRuntime] = useState<PersonaRuntime | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memorySummary, setMemorySummary] = useState("");
  const [unsummarizedTurns, setUnsummarizedTurns] = useState<ChatTurn[]>([]);
  const [userTurnCount, setUserTurnCount] = useState(0);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [dateLabel, setDateLabel] = useState("");
  const [savedChats, setSavedChats] = useState<StoredChatState[]>([]);
  const [step3AvatarUrl, setStep3AvatarUrl] = useState("");
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [memoryBalance, setMemoryBalance] = useState<number | null>(null);
  const [isMemoryBadgeAnimating, setIsMemoryBadgeAnimating] = useState(false);
  const [isChatListOpen, setIsChatListOpen] = useState(false);
  const [isPersonaSheetOpen, setIsPersonaSheetOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const initialMessageRequestIdRef = useRef(0);
  const isComposingRef = useRef(false);
  const memoryBalanceRef = useRef<number | null>(null);
  const memoryBadgeAnimTimeoutRef = useRef<number | null>(null);

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
    };
  }, []);

  async function queueInitialAssistantMessage(targetRuntime: PersonaRuntime) {
    const requestId = ++initialMessageRequestIdRef.current;
    const preferredAlias = normalizeAddressAlias((targetRuntime as any)?.addressing?.callsUserAs?.[0] || "") || "너";
    const requestedAt = Date.now();
    setIsTyping(true);

    let first = "";
    try {
      first = await fetchFirstGreeting(targetRuntime, preferredAlias);
      if (!first) {
        await sleep(120);
        first = await fetchFirstGreeting(targetRuntime, preferredAlias);
      }
    } catch (error) {
      console.error("[chat] first greeting generation failed", error);
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
    setUnsummarizedTurns([{ role: "assistant", content: first }]);
    setDateLabel(formatDateLabel(firstAt));
    setIsTyping(false);
  }

  async function resetChatOnly() {
    if (!runtime) return;
    setMenuOpen(false);
    setInput("");
    setMemorySummary("");
    setUnsummarizedTurns([]);
    setUserTurnCount(0);
    setMessages([]);
    setDateLabel("");
    window.localStorage.removeItem(getChatStateKey(runtime.personaId));

    // Clear DB
    try {
      await fetch(`/api/chat/session?personaId=${runtime.personaId}`, { method: "DELETE" });
    } catch (err) {
      console.error("[chat] failed to reset db session", err);
    }

    void queueInitialAssistantMessage(runtime);
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
        }
      } catch {
        if (!cancelled) {
          setMemoryBalance(null);
        }
      }
    };

    loadMemoryBalance();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Entering chat should always start from the top of the page viewport.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    // Reset local state for the new session.
    setMessages([]);
    setIsLoaded(false);
    setIsTyping(false);
    setMemorySummary("");
    setUnsummarizedTurns([]);
    setUserTurnCount(0);

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
              runtime: p.runtime || null,
              messages: p.last_message_content ? [{ id: "last", role: "assistant", content: p.last_message_content, createdAt: p.updated_at }] : [],
              lastMessage: p.last_message_content || "",
              memorySummary: p.memory_summary || "",
              unsummarizedTurns: [],
              userTurnCount: p.user_turn_count || 0,
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
          setMemorySummary(data.memorySummary || "");
          setUnsummarizedTurns(data.unsummarizedTurns || []);
          setUserTurnCount(data.userTurnCount || 0);
        }
      } catch (err) {
        console.error("[chat] failed to load from db", err);
      }

      if (!hasDbMessages) {
        setMemorySummary("");
        setUnsummarizedTurns([]);
        setUserTurnCount(0);
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping]);

  useEffect(() => {
    const closeMenu = () => setMenuOpen(false);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  useEffect(() => {
    if (!isPersonaSheetOpen) return;
    setMenuOpen(false);
  }, [isPersonaSheetOpen]);

  useEffect(() => {
    if (!runtime) return;
    const stateKey = getChatStateKey(runtime.personaId);
    const payload: StoredChatState = {
      personaId: runtime.personaId,
      personaName: runtime.displayName || "알 수 없음",
      avatarUrl: (runtime as any)?.avatarUrl || step3AvatarUrl || "",
      messages,
      memorySummary,
      unsummarizedTurns,
      userTurnCount,
      updatedAt: nowIso(),
    };
    window.localStorage.setItem(stateKey, JSON.stringify(payload));
  }, [runtime, messages, memorySummary, unsummarizedTurns, userTurnCount]);

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

  function openDeleteFlow() {
    setMenuOpen(false);
    setReviewError("");
    if (runtime?.personaId) {
      setChatToDelete(runtime.personaId);
    }
  }

  function clearLocalMemory() {
    if (runtime) {
      window.localStorage.removeItem(getChatStateKey(runtime.personaId));
    }
    clearPersonaArtifacts();
    ONBOARDING_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  }

  const reviewUserName = ((runtime as any)?.userName || "").trim();

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedReview = reviewText.trim();

    if (!trimmedReview || trimmedReview.length >= 50) {
      setReviewError("후기는 1~49자로 작성해주세요.");
      return;
    }

    setIsSavingReview(true);
    setReviewError("");

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reviewUserName,
          nameMasked: maskDisplayName(reviewUserName),
          review: trimmedReview,
          feedback: feedbackText.trim(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "후기 저장에 실패했습니다.");
      }

      if (savedChats.length > 0) {
        // More chats remain, just go to list
        window.localStorage.removeItem(getChatStateKey(runtime?.personaId || ""));
        clearPersonaArtifacts(runtime?.personaId);
        router.push("/chat/list");
      } else {
        // Last one deleted, clean everything and go home
        clearLocalMemory();
        router.push("/");
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "후기 저장 중 오류가 발생했습니다.");
      setIsSavingReview(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposingRef.current) return;
    const trimmed = input.slice(0, USER_INPUT_CHAR_LIMIT).trim();
    if (!trimmed || !runtime || isTyping) return;
    if (
      typeof memoryBalanceRef.current === "number" &&
      memoryBalanceRef.current < MEMORY_COSTS.chat
    ) {
      router.push(`/payment?returnTo=${encodeURIComponent(`/chat?id=${runtime.personaId}`)}`);
      return;
    }

    const userAt = nowIso();
    const userMessage: ChatMessage = { id: toId(), role: "user", content: trimmed, createdAt: userAt };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);
    const startedAt = Date.now();
    let usedOptimisticSpend = false;
    if (typeof memoryBalanceRef.current === "number") {
      const nextBalance = Math.max(memoryBalanceRef.current - MEMORY_COSTS.chat, 0);
      memoryBalanceRef.current = nextBalance;
      setMemoryBalance(nextBalance);
      triggerMemorySpendAnimation();
      usedOptimisticSpend = true;
    }

    const nextUserTurn = userTurnCount + 1;
    let nextSummary = memorySummary;
    let turnBuffer = [...unsummarizedTurns];
    const runtimeTokenEstimate = estimateTokenCountFromText(JSON.stringify(runtime));
    const summaryTokenEstimate = estimateTokenCountFromText(nextSummary);
    const bufferedTokenEstimate = estimateTokenCountFromTurns(turnBuffer);
    const shouldCompress =
      nextUserTurn >= COMPRESSION_MIN_USER_TURNS &&
      bufferedTokenEstimate + runtimeTokenEstimate + summaryTokenEstimate >= COMPRESSION_TRIGGER_TOKENS;

    try {
      if (shouldCompress) {
        try {
          const compressionResponse = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "compress",
              runtime,
              previousSummary: nextSummary,
              messages: turnBuffer,
            }),
          });

          if (compressionResponse.ok) {
            const compressionPayload = (await compressionResponse.json()) as { summary?: string };
            const compressed = compressionPayload.summary?.trim();
            if (compressed) {
              nextSummary = compressed;
              turnBuffer = [];
            }
          }
        } catch (error) {
          console.error("[chat] compression failed, continue without compression", error);
        }
      }

      const historyForReply: ChatTurn[] = [...turnBuffer.slice(-RECENT_CONTEXT_MESSAGES), { role: "user", content: trimmed }];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          runtime,
          memorySummary: nextSummary,
          messages: historyForReply,
        }),
      });

      let replyText = "";
      let nextBalanceFromServer: number | null = null;
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        if (response.status === 402 || body.code === "MEMORY_INSUFFICIENT") {
          router.push(`/payment?returnTo=${encodeURIComponent(`/chat?id=${runtime.personaId}`)}`);
          return;
        }
      } else {
        const payload = (await response.json()) as { reply?: string; memoryBalance?: number };
        replyText = (payload.reply || "").trim();
        if (typeof payload.memoryBalance === "number") {
          nextBalanceFromServer = payload.memoryBalance;
        }
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
      const turnUser: ChatTurn = { role: "user", content: trimmed };
      const turnAssistant: ChatTurn = { role: "assistant", content: replyText };
      setMessages((prev) => [...prev, aiMessage]);

      if (typeof nextBalanceFromServer === "number") {
        memoryBalanceRef.current = nextBalanceFromServer;
        setMemoryBalance(nextBalanceFromServer);
        if (!usedOptimisticSpend) {
          triggerMemorySpendAnimation();
        }
      }

      setMemorySummary(nextSummary);
      setUnsummarizedTurns([...turnBuffer, turnUser, turnAssistant].slice(-60));
      setUserTurnCount(nextUserTurn);
    } catch (error) {
      console.error("[chat] submission failed", error);
    } finally {
      setIsTyping(false);
    }
  }

  const chatLayoutPaddingClass = savedChats.length > 0 ? "lg:pl-[34rem]" : "lg:pl-64";

  if (!isLoaded) {
    return <ChatLoadingScaffold />;
  }

  if (!runtime) {
    if (savedChats.length > 0) {
      return (
        <div className="flex h-dvh overflow-hidden bg-[#faf9f5] font-body text-[#2f342e]">
          <Navigation />
          <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300 ${chatLayoutPaddingClass}`}>
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-center lg:pb-0">
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
        <Navigation />
        <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300 ${chatLayoutPaddingClass}`}>
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-center lg:pb-0">
            <div className="max-w-md rounded-3xl border border-[#afb3ac]/20 bg-white p-8 shadow-sm">
              <p className="mb-2 font-headline text-2xl font-bold text-[#4a626d]">새로운 기억을 만들어 대화를 시작하세요.</p>
              <Link
                href="/step-1"
                className="inline-flex items-center justify-center rounded-full bg-[#4a626d] px-5 py-3 text-sm font-semibold text-[#f0f9ff]"
              >
                새로운 기억 만들기
              </Link>
            </div>
          </div>
        </main>
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
      <Navigation />
      
      <main className={`flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden transition-all duration-300 ${chatLayoutPaddingClass}`}>
        {/* Mobile Chat Header (Specific to this chat) */}
        <div className="fixed top-0 left-0 z-10 flex h-16 w-full items-center justify-between border-b border-white/5 bg-[#242926]/80 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="mr-1 p-1 text-[#afb3ac] hover:text-[#f0f9ff]"
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
                <p className="font-headline text-base font-bold text-[#f0f9ff]">{personaName}</p>
                <ChevronDownIcon className="h-4 w-4 text-[#afb3ac]" />
              </div>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <MemoryBalanceBadge
              memoryBalance={memoryBalance}
              isAnimating={isMemoryBadgeAnimating}
            />
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} className="p-2 text-[#afb3ac]">
              <MenuIcon />
            </button>
          </div>
          {menuOpen && (
            <div className="absolute right-4 top-14 z-40 w-fit min-w-[120px] rounded-2xl bg-[#303733] p-1.5 shadow-2xl ring-1 ring-white/5 border border-white/5" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setIsPersonaSheetOpen(true);
                  }}
                  className="w-full whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold text-[#f0f5f2] hover:bg-white/5"
                >
                  기억 수정하기
                </button>
                <div className="mx-2 my-1 h-[1px] bg-white/5" />
                <button
                  type="button"
                  onClick={openDeleteFlow}
                  className="w-full whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold text-[#f0b6b4] hover:bg-white/5"
                >
                  내 기억 삭제
                </button>
                <div className="mx-2 my-1 h-[1px] bg-white/5" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowResetConfirm(true);
                  }}
                  className="w-full whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold text-[#f0f5f2] hover:bg-white/5"
                >
                  채팅 초기화
                </button>
            </div>
          )}
        </div>

        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 md:px-6 overflow-hidden">
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
              <h1 className="font-headline text-xl font-bold tracking-tight text-[#4a626d]">{personaName}</h1>
            </div>
            <div className="relative flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <MemoryBalanceBadge
                memoryBalance={memoryBalance}
                isAnimating={isMemoryBadgeAnimating}
              />
              <button onClick={() => setMenuOpen(!menuOpen)} className="rounded-xl p-2 text-[#afb3ac] hover:bg-black/5 hover:text-[#4a626d]">
                <MenuIcon />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 z-40 w-fit min-w-[120px] rounded-2xl bg-[#303733] p-1.5 shadow-2xl ring-1 ring-white/5 border border-white/5">
                <button onClick={openDeleteFlow} className="w-full whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold text-[#f0b6b4] hover:bg-white/5">
                  내 기억 삭제
                </button>
                <div className="mx-2 my-1 h-[1px] bg-white/5" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setIsPersonaSheetOpen(true);
                  }}
                  className="w-full whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold text-[#f0f5f2] hover:bg-white/5"
                >
                  기억 수정하기
                </button>
                <div className="mx-2 my-1 h-[1px] bg-white/5" />
                <button onClick={() => { setMenuOpen(false); setShowResetConfirm(true); }} className="w-full whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold text-[#f0f5f2] hover:bg-white/5">
                  채팅 초기화
                </button>
              </div>
            )}
            </div>
          </header>

          <section className="hide-scrollbar flex-1 space-y-8 overflow-y-auto px-2 pb-8 pt-4 lg:pt-0">
            <div className="flex justify-center mt-20 lg:mt-0">
              <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-wide text-[#afb3ac]">
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
                      <div className="rounded-3xl rounded-tl-sm bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
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
                <div className="rounded-2xl rounded-tl-sm bg-white/50 px-5 py-3 shadow-sm">
                  <DotTyping />
                </div>
              </div>
            )}
            <div ref={chatEndRef} className="h-10" />
          </section>

          <footer className="bg-transparent pb-[calc(6.4rem+env(safe-area-inset-bottom))] pt-4 lg:pb-8">
            <form onSubmit={handleSubmit} className="relative flex items-end gap-2 px-2">
              <div className="relative flex-1 flex items-center bg-white rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.04)] ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-[#4a626d]/20 transition-all">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      const nativeEvent = e.nativeEvent as KeyboardEvent;
                      if (isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) {
                        return;
                      }
                      e.preventDefault();
                      const form = e.currentTarget.closest("form");
                      if (form) form.requestSubmit();
                    }
                  }}
                  placeholder={placeholder}
                  className="w-full max-h-32 resize-none border-none bg-transparent p-4 pl-6 pr-14 text-[15px] leading-relaxed text-[#2f342e] outline-none transition-all font-body"
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="absolute inset-y-0 right-2 my-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#4a626d] text-white shadow-lg shadow-[#4a626d]/20 transition-all hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-30"
                >
                  <SendIcon />
                </button>
              </div>
            </form>
            <p className="mt-3 text-center text-[10px] font-medium text-[#afb3ac] hidden lg:block">
              {personaName}가 {memoryCount}개의 정리된 기억을 바탕으로 답장을 준비하고 있어요.
            </p>
          </footer>
        </div>
      </main>

      {/* Modals */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-5 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-2xl animate-fade-in relative" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline text-xl font-bold text-[#2f342e]">채팅 초기화</h3>
            <p className="mt-4 text-sm leading-relaxed text-[#655d5a]">
              현재 창의 대화 내용만 모두 지워지고 처음 인사부터 다시 시작됩니다. 진행하시겠습니까?
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="rounded-2xl border border-[#afb3ac]/20 py-3.5 text-sm font-bold text-[#655d5a] hover:bg-black/5">
                취소
              </button>
              <button onClick={() => { setShowResetConfirm(false); resetChatOnly(); }} className="rounded-2xl bg-[#9f403d] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#9f403d]/20 hover:opacity-90">
                초기화
              </button>
            </div>
          </section>
        </div>
      )}

      {chatToDelete !== null && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-5 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-2xl animate-fade-in relative" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline text-xl font-bold text-[#2f342e]">내 기억 삭제</h3>
            <p className="mt-4 text-sm leading-relaxed text-[#655d5a]">
              선택한 페르소나와 대화 기록을 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button onClick={() => setChatToDelete(null)} className="rounded-2xl border border-[#afb3ac]/20 py-3.5 text-sm font-bold text-[#655d5a] hover:bg-black/5">
                취소
              </button>
              <button
                onClick={() => {
                  const targetId = chatToDelete;
                  if (!targetId) return;
                  fetch(`/api/persona?personaId=${targetId}`, { method: "DELETE" }).catch(e => console.error(e));
                  clearPersonaArtifacts(targetId);
                  window.localStorage.removeItem(getChatStateKey(targetId));
                  setSavedChats(prev => prev.filter(c => c.personaId !== targetId));
                  setChatToDelete(null);
                  if (runtime?.personaId === targetId) setShowReviewModal(true);
                }}
                className="rounded-2xl bg-[#9f403d] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#9f403d]/20 hover:opacity-90"
              >
                삭제하기
              </button>
            </div>
          </section>
        </div>
      )}

      {showReviewModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 px-5 backdrop-blur-md">
          <section className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-2xl animate-fade-in relative" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline text-2xl font-bold text-[#2f342e]">후기 남기기</h3>
            <p className="mt-3 text-sm text-[#655d5a]">짧게 남겨주시면 더 나은 대화를 만드는 데 도움이 됩니다.</p>

            <form className="mt-8 space-y-6" onSubmit={handleReviewSubmit}>
              <div className="space-y-3">
                <label className="text-sm font-bold text-[#2f342e]">후기 (필수, 50자 미만)</label>
                <textarea
                  value={reviewText}
                  onChange={(e) => { setReviewText(e.target.value); setReviewError(""); }}
                  maxLength={49}
                  rows={3}
                  className="w-full resize-none rounded-2xl bg-[#faf9f5] border-none p-4 text-sm text-[#2f342e] outline-none ring-1 ring-[#afb3ac]/20 focus:ring-2 focus:ring-[#4a626d]/20"
                  placeholder="예: 생각보다 마음이 차분해져서 좋았어요."
                />
                <p className="text-right text-[10px] text-[#afb3ac]">{reviewText.trim().length}/49</p>
              </div>

              {reviewError && <p className="text-sm font-bold text-[#9f403d]">{reviewError}</p>}

              <button
                type="submit"
                disabled={isSavingReview || !reviewText.trim() || reviewText.trim().length >= 50}
                className="w-full rounded-2xl bg-[#4a626d] py-4 text-base font-bold text-white shadow-lg shadow-[#4a626d]/20 disabled:opacity-50 transition-all hover:scale-[0.98]"
              >
                {isSavingReview ? "저장 중..." : "후기 저장하고 완료"}
              </button>
            </form>
          </section>
        </div>
      )}

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
            <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-white/10 shrink-0" />
            
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
                    <p className="truncate text-xs text-[#afb3ac] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
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
               onClick={() => router.push('/step-1')}
               className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-white/10 py-4 text-sm font-bold text-[#afb3ac] active:bg-white/5"
            >
               <span>새로운 기억 만들기</span>
               <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
               </svg>
            </button>
          </div>
        </div>
      )}
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
