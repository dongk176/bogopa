"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPersonaArtifacts } from "@/lib/persona/storage";

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
    messages: ChatMessage[];
    memorySummary: string;
    unsummarizedTurns: ChatTurn[];
    userTurnCount: number;
    updatedAt: string;
};

const CHAT_STATE_KEY_PREFIX = "bogopa_chat_state";

function ArrowLeftIcon() {
    return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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

export default function ChatListPage() {
    const router = useRouter();
    const [savedChats, setSavedChats] = useState<StoredChatState[]>([]);
    const [chatToDelete, setChatToDelete] = useState<string | null>(null);

    // Review states
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewText, setReviewText] = useState("");
    const [feedbackText, setFeedbackText] = useState("");
    const [reviewError, setReviewError] = useState("");
    const [isSavingReview, setIsSavingReview] = useState(false);

    useEffect(() => {
        const fetchPersonas = async () => {
            try {
                const res = await fetch("/api/persona", { cache: "no-store" });
                const data = await res.json();
                if (data.ok && Array.isArray(data.personas)) {
                    const dbChats: StoredChatState[] = data.personas.map((p: any) => ({
                        personaId: p.persona_id,
                        personaName: p.name,
                        avatarUrl: p.avatar_url,
                        messages: p.last_message_content ? [{ id: "last", role: "assistant", content: p.last_message_content, createdAt: p.updated_at }] : [],
                        memorySummary: p.memory_summary || "",
                        unsummarizedTurns: [],
                        userTurnCount: p.user_turn_count || 0,
                        updatedAt: p.updated_at,
                    }));

                    dbChats.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
                    setSavedChats(dbChats);
                } else {
                    setSavedChats([]);
                }
            } catch (err) {
                console.error("[chat-list] failed to fetch from db", err);
                setSavedChats([]);
            }
        };

        fetchPersonas();
    }, []);

    async function handleDelete() {
        if (!chatToDelete) return;

        // DB Delete
        try {
            await fetch(`/api/persona?personaId=${chatToDelete}`, { method: "DELETE" });
        } catch (err) {
            console.error("[chat-list] failed to delete from db", err);
        }

        // Also clean up artifacts and localStorage for this ID if any exist
        clearPersonaArtifacts(chatToDelete);
        window.localStorage.removeItem(CHAT_STATE_KEY_PREFIX + "_" + chatToDelete);

        setSavedChats((prev) => prev.filter((c) => c.personaId !== chatToDelete));
        setChatToDelete(null);
        setShowReviewModal(true);
    }

    function maskDisplayName(name: string) {
        if (!name) return "";
        if (name.length <= 1) return "*";
        return name[0] + "*".repeat(name.length - 1);
    }

    async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
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
                    review: trimmedReview,
                    feedback: feedbackText.trim(),
                }),
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string };
                throw new Error(body.error || "후기 저장에 실패했습니다.");
            }

            // Redirect logic based on remaining chats
            if (savedChats.length > 0) {
              setShowReviewModal(false);
              setReviewText("");
              setFeedbackText("");
            } else {
              router.push("/");
            }
        } catch (error) {
            setReviewError(error instanceof Error ? error.message : "후기 저장 중 오류가 발생했습니다.");
            setIsSavingReview(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#faf9f5] text-[#2f342e]">
            <nav className="sticky top-0 z-50 w-full bg-[#faf9f5]/80 backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-full items-center gap-2 px-3">
                    <button
                        type="button"
                        onClick={() => router.push("/")}
                        className="rounded-xl p-2 text-[#4a626d] transition-colors hover:bg-[#f4f4ef]"
                        aria-label="홈으로가기"
                    >
                        <ArrowLeftIcon />
                    </button>
                    <div className="flex-1 pr-10">
                        <h1 className="text-center font-headline text-lg font-bold tracking-tight text-[#4a626d]">대화 목록</h1>
                    </div>
                </div>
            </nav>

            <main className="mx-auto max-w-md px-4 py-6 pb-20">
                <div className="mb-6">
                    <p className="text-sm font-medium text-[#655d5a]">이전 대화방으로 언제든 돌아가세요</p>
                </div>

                <div className="space-y-3">
                    {savedChats.length === 0 ? (
                        <div className="py-10 text-center text-sm text-[#afb3ac]">아직 대화 기록이 없어요.</div>
                    ) : (
                        savedChats.map((chat) => (
                            <div
                                key={chat.personaId}
                                className="group relative flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition-all focus-within:ring-2 focus-within:ring-[#4a626d]/20 hover:shadow-md"
                            >
                                <Link
                                    href={`/chat?id=${chat.personaId}`}
                                    className="flex min-w-0 flex-1 items-center gap-4"
                                >
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-black/5">
                                        {chat.avatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={chat.avatarUrl.includes("amazonaws.com") ? `/api/image-proxy?url=${encodeURIComponent(chat.avatarUrl)}` : chat.avatarUrl}
                                                alt={chat.personaName || "프로필"}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : null}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-headline text-base font-bold text-[#2f342e]">{chat.personaName}</p>
                                        <p className="mt-0.5 truncate text-sm text-[#5d605a]">
                                            {chat.messages && chat.messages.length > 0
                                                ? chat.messages[chat.messages.length - 1].content
                                                : "새로운 대화장"}
                                        </p>
                                    </div>
                                </Link>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setChatToDelete(chat.personaId);
                                    }}
                                    className="p-2 text-[#afb3ac] transition-colors active:text-[#9f403d]"
                                    aria-label="채팅 삭제"
                                >
                                    <MoreVerticalIcon />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <Link href="/step-1" className="mt-8 flex justify-center rounded-xl bg-[#4a626d] py-3.5 text-base font-semibold text-white shadow-lg transition-colors active:bg-[#3d535e]">
                    새 페르소나 만들기
                </Link>
            </main>

            {chatToDelete !== null ? (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-5">
                    <section className="w-full max-w-md rounded-3xl bg-[#303733] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                        <h3 className="font-headline text-xl font-bold text-[#f0f5f2]">내 기억 삭제</h3>
                        <p className="mt-3 text-sm leading-relaxed text-[#f0f5f2]/80">
                            선택한 페르소나와 대화 기록을 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setChatToDelete(null)}
                                className="rounded-xl border border-[#afb3ac]/30 px-4 py-3 text-sm font-semibold text-[#f0f5f2] transition-colors active:bg-white/5"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="rounded-xl bg-[#9f403d] px-4 py-3 text-sm font-semibold text-[#fff7f6] transition-opacity active:opacity-90"
                            >
                                삭제 확인
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {showReviewModal ? (
                <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/50 px-5">
                    <section className="w-full max-w-md rounded-3xl bg-[#303733] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                        <h3 className="font-headline text-xl font-bold text-[#f0f5f2]">후기 남기기</h3>
                        <p className="mt-2 text-sm text-[#f0f5f2]/80">짧게 남겨주시면 더 나은 대화를 만드는 데 도움이 됩니다.</p>

                        <form className="mt-5 space-y-4" onSubmit={handleReviewSubmit}>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-[#f0f5f2]/90">후기 (필수, 50자 미만)</label>
                                <textarea
                                    value={reviewText}
                                    onChange={(e) => {
                                        setReviewText(e.target.value);
                                        if (reviewError) setReviewError("");
                                    }}
                                    maxLength={49}
                                    rows={3}
                                    className="w-full resize-none rounded-xl border-none bg-black/20 px-4 py-3 text-sm text-[#f0f5f2] outline-none ring-0 focus:ring-2 focus:ring-[#f0b6b4]/50 placeholder:text-[#f0f5f2]/30"
                                    placeholder="예: 생각보다 마음이 차분해져서 좋았어요."
                                />
                                <p className="text-right text-xs text-[#f0f5f2]/50">{reviewText.trim().length}/49</p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-[#f0f5f2]/90">(선택) 피드백</label>
                                <textarea
                                    value={feedbackText}
                                    onChange={(e) => setFeedbackText(e.target.value)}
                                    rows={3}
                                    className="w-full resize-none rounded-xl border-none bg-black/20 px-4 py-3 text-sm text-[#f0f5f2] outline-none ring-0 focus:ring-2 focus:ring-[#4a626d]/50 placeholder:text-[#f0f5f2]/30"
                                    placeholder="개선할 점이 있다면 알려주세요."
                                />
                            </div>

                            {reviewError ? (
                                <p className="text-xs text-[#f0b6b4]">{reviewError}</p>
                            ) : null}

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={!reviewText.trim() || isSavingReview}
                                    className="w-full rounded-xl bg-[#4a626d] py-3 text-sm font-bold text-[#f0f9ff] shadow-lg shadow-[#4a626d]/20 transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSavingReview ? "저장 중..." : "후기 남기고 계속하기"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (savedChats.length > 0) {
                                            setShowReviewModal(false);
                                        } else {
                                            router.push("/");
                                        }
                                    }}
                                    className="mt-3 w-full py-2 text-center text-xs text-[#f0f5f2]/40 underline transition-colors hover:text-[#f0f5f2]/60"
                                >
                                    건너뛰기
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            ) : null}
        </div>
    );
}
