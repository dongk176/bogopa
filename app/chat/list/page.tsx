"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/app/_components/Navigation";
import useMemoryCreateGuard from "@/app/_components/useMemoryCreateGuard";
import MemoryPassExpiredLockOverlay from "@/app/_components/MemoryPassExpiredLockOverlay";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
};

type StoredChatState = {
    personaId: string;
    personaName?: string;
    avatarUrl?: string;
    isLocked?: boolean;
    messages: ChatMessage[];
    updatedAt: string;
};

export default function ChatListPage() {
    const router = useRouter();
    const [savedChats, setSavedChats] = useState<StoredChatState[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lockedPersonaName, setLockedPersonaName] = useState("");

    // Review states
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewText, setReviewText] = useState("");
    const [feedbackText, setFeedbackText] = useState("");
    const [reviewError, setReviewError] = useState("");
    const [isSavingReview, setIsSavingReview] = useState(false);
    const { guardCreateStart, modalNode, isChecking } = useMemoryCreateGuard();

    useEffect(() => {
        const fetchPersonas = async () => {
            setIsLoading(true);
            try {
                const res = await fetch("/api/persona", { cache: "no-store" });
                const data = await res.json();
                if (data.ok && Array.isArray(data.personas)) {
                    const dbChats: StoredChatState[] = data.personas
                        .filter((p: any) => Boolean(p.last_message_content))
                        .map((p: any) => ({
                            // latest chat activity time (session) must drive sorting
                            // fallback to persona updated time only when session timestamp is missing
                            // to keep ordering stable.
                            personaId: p.persona_id,
                            personaName: p.name,
                            avatarUrl: p.avatar_url,
                            isLocked: Boolean(p.is_locked),
                            messages: p.last_message_content
                                ? [{ id: "last", role: "assistant", content: p.last_message_content, createdAt: p.updated_at }]
                                : [],
                            updatedAt: p.session_updated_at || p.updated_at,
                        }));

                    dbChats.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
                    setSavedChats(dbChats);
                } else {
                    setSavedChats([]);
                }
            } catch (err) {
                console.error("[chat-list] failed to fetch from db", err);
                setSavedChats([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPersonas();
    }, []);

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
            <Navigation />

            <header className="fixed top-0 z-40 w-full border-b border-[#d6ddd8] bg-[#ffffff]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
                <div className="mx-auto flex h-16 w-full max-w-md items-center justify-center px-3">
                    <h1 className="font-headline text-lg font-bold tracking-tight text-[#4a626d]">대화 목록</h1>
                </div>
            </header>

            <main className="mx-auto max-w-md px-3 pb-[calc(6.4rem+max(env(safe-area-inset-bottom),0.5rem))] pt-[calc(5rem+env(safe-area-inset-top))] md:px-6 md:pt-20 lg:max-w-2xl lg:pl-64 lg:pb-20">
                <header className="mb-10 hidden text-center lg:block">
                    <h1 className="font-headline text-lg font-bold tracking-tight text-[#4a626d]">대화 목록</h1>
                </header>
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="h-24" />
                    ) : savedChats.length === 0 ? (
                        <div className="py-10 text-center text-sm text-[#afb3ac]">아직 대화 기록이 없어요.</div>
                    ) : (
                        savedChats.map((chat) => (
                            <div
                                key={chat.personaId}
                                className="group relative flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition-all focus-within:ring-2 focus-within:ring-[#4a626d]/20 hover:shadow-md"
                            >
                                <Link
                                    href={`/chat?id=${chat.personaId}`}
                                    onClick={(event) => {
                                        if (!chat.isLocked) return;
                                        event.preventDefault();
                                        setLockedPersonaName(chat.personaName || "이 기억");
                                    }}
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
                                {chat.isLocked ? (
                                    <span className="ml-3 shrink-0 rounded-full bg-[#f2f4f7] px-2 py-1 text-[10px] font-extrabold text-[#344054]">
                                        잠금
                                    </span>
                                ) : null}
                            </div>
                        ))
                    )}
                </div>

                {!isLoading ? (
                    <button
                        type="button"
                        disabled={isChecking}
                        onClick={() => {
                            void guardCreateStart({
                                returnTo: "/chat/list",
                                onAllowed: () => router.push("/step-1/start"),
                            });
                        }}
                        className="mt-8 flex w-full justify-center rounded-xl bg-[#4a626d] py-3.5 text-base font-semibold text-white shadow-lg transition-colors active:bg-[#3d535e] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        새 기억 만들기
                    </button>
                ) : null}
            </main>

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
            <MemoryPassExpiredLockOverlay
                open={Boolean(lockedPersonaName)}
                onClose={() => setLockedPersonaName("")}
                returnTo="/chat/list"
                title="기억 패스가 만료되었어요"
                description={`${lockedPersonaName || "이 기억"}과의 대화는 잠금 상태입니다. 구독하면 바로 다시 열려요.`}
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
