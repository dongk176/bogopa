"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { generateMockReply } from "@/lib/persona/generateMockReply";
import { clearPersonaArtifacts, loadPersonaAnalysis, loadPersonaRuntime } from "@/lib/persona/storage";
import { PersonaAnalysis, PersonaRuntime } from "@/types/persona";

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
  messages: ChatMessage[];
  memorySummary: string;
  unsummarizedTurns: ChatTurn[];
  userTurnCount: number;
  updatedAt: string;
};

const CHAT_STATE_KEY_PREFIX = "bogopa_chat_state";
const USER_INPUT_CHAR_LIMIT = 100;
const DEFAULT_ASSISTANT_CHAR_LIMIT = 300;
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

function shouldAllowLongReply(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(길게|자세히|상세하게|구체적으로|천천히 설명|긴 답변|자세한 설명|길게 말해)/.test(normalized);
}

function clipAssistantReply(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.length > DEFAULT_ASSISTANT_CHAR_LIMIT
    ? trimmed.slice(0, DEFAULT_ASSISTANT_CHAR_LIMIT).trimEnd()
    : trimmed;
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

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="5" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="12" cy="19" r="1.2" />
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

function DotTyping() {
  return (
    <div className="flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#655d5a]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#655d5a] [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#655d5a] [animation-delay:-0.3s]" />
    </div>
  );
}

async function fetchFirstGreeting(runtime: PersonaRuntime, analysis: PersonaAnalysis | null, alias: string) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "first_greeting",
      runtime,
      analysis,
      alias,
      styleSummary: runtime.style.tone[0] || "",
    }),
  });

  if (!response.ok) return "";
  const payload = (await response.json()) as { greeting?: string };
  return payload.greeting?.trim() || "";
}

function normalizeAddressAlias(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 1) {
    if (trimmed.endsWith("야") || trimmed.endsWith("아")) return trimmed.slice(0, -1);
    if (trimmed.endsWith("님") || trimmed.endsWith("씨")) return trimmed.slice(0, -1);
  }
  return trimmed;
}

export default function ChatPage() {
  const router = useRouter();
  const [runtime, setRuntime] = useState<PersonaRuntime | null>(null);
  const [analysis, setAnalysis] = useState<PersonaAnalysis | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memorySummary, setMemorySummary] = useState("");
  const [unsummarizedTurns, setUnsummarizedTurns] = useState<ChatTurn[]>([]);
  const [userTurnCount, setUserTurnCount] = useState(0);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [dateLabel, setDateLabel] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const initialMessageRequestIdRef = useRef(0);

  async function queueInitialAssistantMessage(targetRuntime: PersonaRuntime, targetAnalysis: PersonaAnalysis | null) {
    const requestId = ++initialMessageRequestIdRef.current;
    const preferredAlias = normalizeAddressAlias(targetRuntime.addressing.callsUserAs[0] || "") || "너";
    const requestedAt = Date.now();
    setIsTyping(true);

    let first = "";
    try {
      first = await fetchFirstGreeting(targetRuntime, targetAnalysis, preferredAlias);
      if (!first) {
        await sleep(120);
        first = await fetchFirstGreeting(targetRuntime, targetAnalysis, preferredAlias);
      }
    } catch (error) {
      console.error("[chat] first greeting generation failed", error);
    }

    if (!first) {
      first = `${preferredAlias}, 안녕. 잘 지냈어? 오늘은 어땠는지 편하게 들려줘.`;
    }
    first = clipAssistantReply(first);

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

  function resetChatOnly() {
    if (!runtime) return;
    setMenuOpen(false);
    setInput("");
    setMemorySummary("");
    setUnsummarizedTurns([]);
    setUserTurnCount(0);
    setMessages([]);
    setDateLabel("");
    window.localStorage.removeItem(getChatStateKey(runtime.personaId));
    void queueInitialAssistantMessage(runtime, analysis);
  }

  useEffect(() => {
    const loadedRuntime = loadPersonaRuntime();
    const loadedAnalysis = loadPersonaAnalysis();
    setRuntime(loadedRuntime);
    setAnalysis(loadedAnalysis);

    if (loadedRuntime) {
      const stateKey = getChatStateKey(loadedRuntime.personaId);
      const rawState = window.localStorage.getItem(stateKey);
      if (rawState) {
        try {
          const parsed = JSON.parse(rawState) as Partial<StoredChatState>;
          const parsedMessages = Array.isArray(parsed.messages)
            ? parsed.messages.filter(
                (item): item is ChatMessage =>
                  !!item &&
                  typeof item.id === "string" &&
                  (item.role === "user" || item.role === "assistant") &&
                  typeof item.content === "string" &&
                  typeof item.createdAt === "string",
              )
            : [];
          const parsedTurns = Array.isArray(parsed.unsummarizedTurns)
            ? parsed.unsummarizedTurns.filter(
                (item): item is ChatTurn =>
                  !!item &&
                  (item.role === "user" || item.role === "assistant") &&
                  typeof item.content === "string",
              )
            : [];

          if (parsed.personaId === loadedRuntime.personaId && parsedMessages.length > 0) {
            setMessages(parsedMessages);
            setDateLabel(formatDateLabel(parsedMessages[0].createdAt));
            setMemorySummary(typeof parsed.memorySummary === "string" ? parsed.memorySummary : "");
            setUnsummarizedTurns(parsedTurns);
            if (typeof parsed.userTurnCount === "number" && Number.isFinite(parsed.userTurnCount)) {
              setUserTurnCount(parsed.userTurnCount);
            } else {
              setUserTurnCount(parsedMessages.filter((item) => item.role === "user").length);
            }
            return;
          }
        } catch {
          // noop
        }
      }

      setMemorySummary("");
      setUnsummarizedTurns([]);
      setUserTurnCount(0);
      void queueInitialAssistantMessage(loadedRuntime, loadedAnalysis);
    }
  }, []);

  useEffect(() => {
    return () => {
      initialMessageRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping]);

  useEffect(() => {
    const closeMenu = () => setMenuOpen(false);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  useEffect(() => {
    if (!runtime) return;
    const stateKey = getChatStateKey(runtime.personaId);
    const payload: StoredChatState = {
      personaId: runtime.personaId,
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
    if (!analysis) return 0;
    const anchorCount = analysis.memoryAnchors.length;
    const phraseCount = analysis.textHabits.frequentPhrases.length;
    return anchorCount * 10 + phraseCount;
  }, [analysis]);

  function openDeleteFlow() {
    setMenuOpen(false);
    setReviewError("");
    setShowDeleteConfirm(true);
  }

  function clearLocalMemory() {
    if (runtime) {
      window.localStorage.removeItem(getChatStateKey(runtime.personaId));
    }
    clearPersonaArtifacts();
    ONBOARDING_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  }

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
          name: analysis?.userInput.userName || "",
          nameMasked: maskDisplayName(analysis?.userInput.userName || ""),
          review: trimmedReview,
          feedback: feedbackText.trim(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "후기 저장에 실패했습니다.");
      }

      clearLocalMemory();
      router.push("/");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "후기 저장 중 오류가 발생했습니다.");
      setIsSavingReview(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.slice(0, USER_INPUT_CHAR_LIMIT).trim();
    if (!trimmed || !runtime || isTyping) return;
    const allowLongReply = shouldAllowLongReply(trimmed);

    const userAt = nowIso();
    const userMessage: ChatMessage = { id: toId(), role: "user", content: trimmed, createdAt: userAt };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);
    const startedAt = Date.now();
    const nextUserTurn = userTurnCount + 1;
    let nextSummary = memorySummary;
    let turnBuffer = [...unsummarizedTurns];

    try {
      if (nextUserTurn % 10 === 0) {
        try {
          const compressionResponse = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "compress",
              runtime,
              analysis,
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

      const historyForReply: ChatTurn[] = nextSummary
        ? [{ role: "user", content: trimmed }]
        : [...turnBuffer.slice(-10), { role: "user", content: trimmed }];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          runtime,
          analysis,
          memorySummary: nextSummary,
          messages: historyForReply,
          allowLongReply,
        }),
      });

      let replyText = "";
      if (response.ok) {
        const payload = (await response.json()) as { reply?: string };
        replyText = clipAssistantReply(payload.reply || "");
      }

      if (!replyText) {
        replyText = clipAssistantReply(generateMockReply(runtime, trimmed));
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
      setMemorySummary(nextSummary);
      setUnsummarizedTurns([...turnBuffer, turnUser, turnAssistant].slice(-60));
      setUserTurnCount(nextUserTurn);
    } catch (error) {
      console.error("[chat] api failed, fallback to mock", error);

      const fallback = clipAssistantReply(generateMockReply(runtime, trimmed));
      const elapsed = Date.now() - startedAt;
      if (elapsed < 650) {
        await sleep(650 - elapsed);
      }

      const aiAt = nowIso();
      const aiMessage: ChatMessage = { id: toId(), role: "assistant", content: fallback, createdAt: aiAt };
      const turnUser: ChatTurn = { role: "user", content: trimmed };
      const turnAssistant: ChatTurn = { role: "assistant", content: fallback };
      setMessages((prev) => [...prev, aiMessage]);
      setMemorySummary(nextSummary);
      setUnsummarizedTurns([...turnBuffer, turnUser, turnAssistant].slice(-60));
      setUserTurnCount(nextUserTurn);
    } finally {
      setIsTyping(false);
    }
  }

  if (!runtime) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f5] px-6 text-center text-[#2f342e]">
        <div className="max-w-md rounded-3xl border border-[#afb3ac]/20 bg-white p-8 shadow-sm">
          <p className="mb-2 font-headline text-2xl font-bold text-[#4a626d]">채팅 준비가 안 됐어요</p>
          <p className="mb-6 text-sm text-[#5d605a]">5단계에서 페르소나 분석을 완료한 뒤 채팅을 시작할 수 있어요.</p>
          <Link
            href="/step-1"
            className="inline-flex items-center justify-center rounded-full bg-[#4a626d] px-5 py-3 text-sm font-semibold text-[#f0f9ff]"
          >
            1단계로 이동
          </Link>
        </div>
      </div>
    );
  }

  const personaName = runtime.displayName || "페르소나";
  const avatarUrl = analysis?.personaInput.avatarUrl || null;

  return (
    <div className="min-h-screen bg-[#faf9f5] text-[#2f342e]">
      <nav className="fixed top-0 z-50 w-full bg-[#faf9f5]/80 backdrop-blur-xl">
        <div className="mx-auto hidden h-16 w-full max-w-7xl items-center justify-between px-6 md:flex md:px-12">
          <div className="font-headline text-2xl font-bold tracking-tighter text-[#4a626d]">보고파</div>
          <div className="hidden items-center gap-8 md:flex">
            <span className="text-[#655d5a]">기록장</span>
            <span className="text-[#655d5a]">추억</span>
            <span className="border-b-2 border-[#4a626d] pb-1 text-[#4a626d]">페르소나</span>
            <span className="text-[#655d5a]">인사이트</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="rounded-full p-2 text-[#4a626d] transition-colors hover:bg-[#f4f4ef]" type="button" aria-label="도움말">
              ?
            </button>
            <button className="rounded-full p-2 text-[#4a626d] transition-colors hover:bg-[#f4f4ef]" type="button" aria-label="설정">
              ⚙
            </button>
          </div>
        </div>

        <div className="mx-auto flex h-16 w-full items-center gap-2 px-3 md:hidden">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl p-2 text-[#4a626d] transition-colors hover:bg-[#f4f4ef]"
            aria-label="뒤로가기"
          >
            <ArrowLeftIcon />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 overflow-hidden rounded-2xl ring-2 ring-white">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="페르소나 프로필" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[#e6e9e2] text-[#4a626d]">
                    <UserAvatarIcon />
                  </div>
                )}
              </div>
              <p className="truncate font-headline text-lg font-bold tracking-tight text-[#2f342e]">{personaName}</p>
            </div>
          </div>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="rounded-xl p-2 text-[#5c605a] transition-colors hover:bg-[#f4f4ef]"
                  aria-label="더보기"
                >
                  <MenuIcon />
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 top-12 z-40 w-48 rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-black/5">
                <button
                  type="button"
                  onClick={openDeleteFlow}
                  className="w-full rounded-xl px-4 py-2 text-left text-sm text-[#2f342e] hover:bg-[#f4f4ef]"
                >
                  내 기억 삭제
                </button>
                <button
                  type="button"
                  onClick={resetChatOnly}
                  className="w-full rounded-xl px-4 py-2 text-left text-sm text-[#2f342e] hover:bg-[#f4f4ef]"
                >
                  채팅 초기화
                </button>
                <div className="my-1 h-px bg-[#edeee8]" />
                <button type="button" className="w-full rounded-xl px-4 py-2 text-left text-sm text-[#9f403d] hover:bg-[#fe8983]/10">
                  대화 내보내기
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </nav>

      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col bg-[#faf9f5] px-4 py-8 lg:flex">
        <div className="mb-10 px-4 pt-12">
          <p className="font-headline text-xl font-bold text-[#4a626d]">보고파 큐레이터</p>
          <p className="text-xs text-[#655d5a]/70">기억 기록장</p>
        </div>
        <div className="flex-1 space-y-1 text-[#655d5a]">
          <div className="rounded-xl px-4 py-3 transition-all hover:translate-x-1">기록장</div>
          <div className="rounded-xl px-4 py-3 transition-all hover:translate-x-1">추억</div>
          <div className="rounded-xl bg-white px-4 py-3 font-semibold text-[#4a626d] shadow-sm transition-all hover:translate-x-1">페르소나</div>
          <div className="rounded-xl px-4 py-3 transition-all hover:translate-x-1">인사이트</div>
          <div className="rounded-xl px-4 py-3 transition-all hover:translate-x-1">설정</div>
        </div>
        <button type="button" className="mx-4 mt-auto rounded-xl bg-[#4a626d] py-3 text-sm font-semibold text-white shadow-lg">
          새 페르소나
        </button>
      </aside>

      <main className="h-screen pb-28 pt-16 lg:pl-64">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 md:px-6">
          <header className="hidden items-center justify-between px-2 py-6 md:flex">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-14 w-14 overflow-hidden rounded-3xl ring-2 ring-white">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="페르소나 프로필" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[#e6e9e2] text-[#4a626d]">
                      <UserAvatarIcon />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h1 className="font-headline text-xl font-bold tracking-tight">{personaName}</h1>
              </div>
            </div>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="rounded-xl p-2 text-[#5c605a] transition-colors hover:bg-[#f4f4ef]"
                aria-label="더보기"
              >
                <MenuIcon />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-12 z-40 w-48 rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-black/5">
                  <button
                    type="button"
                    onClick={openDeleteFlow}
                    className="w-full rounded-xl px-4 py-2 text-left text-sm text-[#2f342e] hover:bg-[#f4f4ef]"
                  >
                    내 기억 삭제
                  </button>
                  <button
                    type="button"
                    onClick={resetChatOnly}
                    className="w-full rounded-xl px-4 py-2 text-left text-sm text-[#2f342e] hover:bg-[#f4f4ef]"
                  >
                    채팅 초기화
                  </button>
                  <div className="my-1 h-px bg-[#edeee8]" />
                  <button type="button" className="w-full rounded-xl px-4 py-2 text-left text-sm text-[#9f403d] hover:bg-[#fe8983]/10">
                    대화 내보내기
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <section className="hide-scrollbar flex-1 space-y-8 overflow-y-auto px-2 pb-8">
            <div className="flex justify-center">
              <span className="rounded-full bg-[#f4f4ef] px-3 py-1 text-[11px] font-semibold tracking-wide text-[#5c605a]/80">
                {dateLabel || formatDateLabel(nowIso())}
              </span>
            </div>

            {messages.map((message) => {
              if (message.role === "assistant") {
                return (
                  <div key={message.id} className="flex items-start gap-3">
                    <div className="pt-1">
                      <div className="h-8 w-8 overflow-hidden rounded-full">
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUrl} alt="페르소나" className="h-full w-full object-cover" />
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
                      <span className="ml-1 mt-2 block text-[10px] text-[#5c605a]/60">{formatTime(message.createdAt)}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className="flex flex-col items-end gap-1">
                  <div className="max-w-[85%]">
                    <div className="rounded-3xl rounded-tr-sm bg-[#cde6f4] p-5">
                      <p className="text-[15px] leading-relaxed text-[#3e5560]">{message.content}</p>
                    </div>
                  </div>
                  <span className="mr-1 text-[10px] text-[#5c605a]/60">{formatTime(message.createdAt)}</span>
                </div>
              );
            })}

            {isTyping ? (
              <div className="flex items-start gap-3 opacity-70">
                <div className="pt-1">
                  <div className="h-8 w-8 overflow-hidden rounded-full">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="페르소나 입력 중" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-[#e6e9e2] text-[#4a626d]">
                        <UserAvatarIcon />
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <DotTyping />
                </div>
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </section>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#faf9f5]/85 pb-6 pt-2 backdrop-blur-md lg:left-64">
        <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, USER_INPUT_CHAR_LIMIT))}
              maxLength={USER_INPUT_CHAR_LIMIT}
              placeholder={placeholder}
              className="w-full rounded-3xl border-none bg-white py-4 pl-6 pr-20 text-[15px] text-[#2f342e] shadow-[0_10px_30px_rgba(0,0,0,0.04)] placeholder:text-[#5c605a]/45 focus:ring-2 focus:ring-[#4a626d]/20"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <button type="button" className="p-2 text-[#5c605a]/70 transition-colors hover:text-[#4a626d]" aria-label="음성">
                <MicIcon />
              </button>
              <button
                type="submit"
                className="grid h-10 w-10 place-items-center rounded-full bg-[#4a626d] text-[#f0f9ff] shadow-lg shadow-[#4a626d]/20 transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!input.trim() || isTyping}
                aria-label="전송"
              >
                <SendIcon />
              </button>
            </div>
          </form>
          <p className="mt-3 text-center text-[10px] font-medium tracking-tight text-[#5c605a]/45">
            {personaName}가 {memoryCount}개의 정리된 기억을 바탕으로 답장을 준비하고 있어요.
          </p>
        </div>
      </div>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 px-5">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(47,52,46,0.22)]">
            <h3 className="font-headline text-xl font-bold text-[#2f342e]">내 기억 삭제</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5d605a]">
              현재 페르소나와 대화 기록을 삭제하고 첫 화면으로 돌아갈 준비를 합니다.
              삭제 후에는 후기를 작성해 주세요.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl border border-[#afb3ac]/60 px-4 py-3 text-sm font-semibold text-[#5c605a]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setShowReviewModal(true);
                }}
                className="rounded-xl bg-[#9f403d] px-4 py-3 text-sm font-semibold text-[#fff7f6]"
              >
                삭제 확인
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showReviewModal ? (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/35 px-5">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(47,52,46,0.22)]">
            <h3 className="font-headline text-xl font-bold text-[#2f342e]">후기 남기기</h3>
            <p className="mt-2 text-sm text-[#5d605a]">짧게 남겨주시면 더 나은 대화를 만드는 데 도움이 됩니다.</p>

            <form className="mt-5 space-y-4" onSubmit={handleReviewSubmit}>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[#4a626d]">후기 (필수, 50자 미만)</label>
                <textarea
                  value={reviewText}
                  onChange={(e) => {
                    setReviewText(e.target.value);
                    if (reviewError) setReviewError("");
                  }}
                  maxLength={49}
                  rows={3}
                  className="w-full resize-none rounded-xl border-none bg-[#f4f4ef] px-4 py-3 text-sm text-[#2f342e] outline-none ring-0 focus:ring-2 focus:ring-[#4a626d]/20"
                  placeholder="예: 생각보다 마음이 차분해져서 좋았어요."
                />
                <p className="text-right text-xs text-[#787c75]">{reviewText.trim().length}/49</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[#4a626d]">(선택) 피드백</label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border-none bg-[#f4f4ef] px-4 py-3 text-sm text-[#2f342e] outline-none ring-0 focus:ring-2 focus:ring-[#4a626d]/20"
                  placeholder="개선되면 좋겠는 점이 있다면 남겨주세요."
                />
              </div>

              {reviewError ? <p className="text-sm font-semibold text-[#9f403d]">{reviewError}</p> : null}

              <button
                type="submit"
                disabled={isSavingReview || !reviewText.trim() || reviewText.trim().length >= 50}
                className="w-full rounded-xl bg-[#4a626d] px-4 py-3 text-sm font-semibold text-[#f0f9ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingReview ? "저장 중..." : "후기 저장하고 첫 화면으로"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
