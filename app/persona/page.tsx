"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/app/_components/Navigation";
import { useSession } from "next-auth/react";
import { PersonaAnalysis, PersonaRuntime, PrimaryGoal } from "@/types/persona";
import { FREE_PLAN_LIMITS, MEMORY_PASS_REQUIRED_MESSAGE, PlanLimits } from "@/lib/memory-pass/config";

type Persona = {
    persona_id: string;
    name: string;
    avatar_url: string | null;
    updated_at: string;
    last_message_content: string | null;
    analysis?: PersonaAnalysis;
    runtime?: PersonaRuntime;
};

const DROPDOWN_OPTIONS = {
    politeness: ["편안한 반말", "정중한 존댓말", "반말+존댓말 혼용", "다정하지만 깍듯함"],
    sentenceLength: ["짧고 간결한 단답", "적당한 길이", "아주 길고 자세하게"],
    replyTempo: ["성격 급한 즉답형", "적당한 템포", "신중하고 느린 편"],
    empathyStyle: ["감성 공감 우선", "차분한 이성적 위로", "해결책 중심의 조언"],
};

const GOAL_VALUE_TO_LABEL: Record<PrimaryGoal, string> = {
    comfort: "위로받고 싶어요",
    memory: "추억을 떠올리고 싶어요",
    unfinished_words: "못다 한 말을 해보고 싶어요",
    casual_talk: "평소처럼 대화하고 싶어요",
    custom: "직접 입력",
};

const GOAL_LABELS = Object.values(GOAL_VALUE_TO_LABEL);
const SUMMARY_PLACEHOLDERS = {
    parent: [
        "예: 다그치지 말고 먼저 안심시키는 말투로, 짧게 안부를 묻고 차분히 마무리해줘.",
        "예: 무리하지 말라는 따뜻한 한마디를 먼저 건네고, 필요한 조언은 짧게 덧붙여줘.",
        "예: 감정을 먼저 받아주고 현실적인 위로를 한 문장으로 정리해주는 톤으로 말해줘.",
    ],
    friend: [
        "예: 가볍고 솔직한 반말로 근황을 물어보되, 부담 주지 않게 편하게 이어가줘.",
        "예: 너무 무겁지 않게 공감하고, 필요할 때만 짧고 현실적인 조언을 해줘.",
        "예: 장난은 가볍게만 하고 상대가 다운되면 바로 차분하게 맞춰주는 톤으로 말해줘.",
    ],
    partner: [
        "예: 다정한 말투로 안부를 먼저 묻고, 감정을 세심하게 받아주는 흐름으로 이어가줘.",
        "예: 불안한 마음을 안정시키는 표현 위주로, 캐묻지 말고 따뜻하게 공감해줘.",
        "예: 가까운 사이의 부드러운 톤으로 하루를 물어보고 편안하게 대화를 이어가줘.",
    ],
    sibling: [
        "예: 편한 가족 말투로 시작하되, 챙기는 느낌을 살려 짧고 명확하게 말해줘.",
        "예: 놀리기보다 실질적으로 도와주는 누나/형 같은 톤으로 대화를 이어가줘.",
        "예: 감정이 올라오면 한 템포 늦춰서 차분하게 받아주고 부담 없이 마무리해줘.",
    ],
    default: [
        "예: 따뜻하지만 과장되지 않은 말투로 감정을 먼저 수용하고 자연스럽게 이어가줘.",
        "예: 답을 강요하지 말고 짧고 명확한 문장으로 편안한 대화 흐름을 유지해줘.",
        "예: 상황을 단정하지 않고 공감 중심으로, 부담 없는 속도로 대화를 이어가줘.",
    ],
} as const;

function toGoalLabel(value?: string) {
    if (!value) return GOAL_VALUE_TO_LABEL.casual_talk;
    return GOAL_VALUE_TO_LABEL[value as PrimaryGoal] || GOAL_VALUE_TO_LABEL.casual_talk;
}

function toGoalValue(label?: string): PrimaryGoal {
    const entry = Object.entries(GOAL_VALUE_TO_LABEL).find(([, text]) => text === label);
    if (!entry) return "casual_talk";
    return entry[0] as PrimaryGoal;
}

function resolveRelationBucket(relation: string) {
    const normalized = relation.replace(/\s/g, "");
    if (/(엄마|아빠|어머니|아버지|부모|할머니|할아버지)/.test(normalized)) return "parent";
    if (/(친구|절친|베프|동창)/.test(normalized)) return "friend";
    if (/(연인|애인|남친|여친|배우자|남편|아내|와이프|부인)/.test(normalized)) return "partner";
    if (/(형|오빠|누나|언니|동생|형제|자매)/.test(normalized)) return "sibling";
    return "default";
}

function pickRandomSummaryPlaceholder(relation: string) {
    const bucket = resolveRelationBucket(relation);
    const candidates = SUMMARY_PLACEHOLDERS[bucket];
    return candidates[Math.floor(Math.random() * candidates.length)] || SUMMARY_PLACEHOLDERS.default[0];
}

function CustomDropdown({ label, options, value, onChange }: { label: string, options: string[], value: string, onChange: (val: string) => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <label className="text-sm font-bold text-[#7b827d] uppercase block mb-2">{label}</label>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#242926] px-5 py-4 text-base font-bold text-[#f0f5f2] transition-all hover:bg-[#2d3430] active:scale-[0.98]"
            >
                <span>{value}</span>
                <svg className={`h-4 w-4 text-[#b8c3be] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute left-0 top-full z-[120] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#1f2421] shadow-xl animate-fade-in">
                    {options.map((opt) => (
                        <button
                            key={opt}
                            onClick={() => {
                                onChange(opt);
                                setIsOpen(false);
                            }}
                            className={`flex w-full items-center px-5 py-4 text-left text-base font-bold transition-colors ${value === opt ? "bg-[#4a626d] text-[#f0f9ff]" : "text-[#e6ece8] hover:bg-[#323a36]"
                                }`}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function PersonaPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [summaryPlaceholder, setSummaryPlaceholder] = useState(() => pickRandomSummaryPlaceholder(""));
    const [limits, setLimits] = useState<PlanLimits>(FREE_PLAN_LIMITS);
    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        if (selectedPersona) {
            document.body.classList.add("modal-open");
        } else {
            document.body.classList.remove("modal-open");
        }
        return () => document.body.classList.remove("modal-open");
    }, [selectedPersona]);

    useEffect(() => {
        if (session === null) {
            router.replace("/");
            return;
        }

        const fetchPersonas = async () => {
            try {
                const res = await fetch("/api/persona", { cache: "no-store" });
                const data = await res.json();
                if (data.ok && Array.isArray(data.personas)) {
                    setPersonas(data.personas);
                }
            } catch (err) {
                console.error("[persona-page] failed to fetch", err);
            } finally {
                setIsLoading(false);
            }
        };

        if (session?.user) {
            fetchPersonas();
            void (async () => {
                try {
                    const response = await fetch("/api/memory-pass", { cache: "no-store" });
                    if (!response.ok) return;
                    const payload = (await response.json()) as { isSubscribed?: boolean; limits?: PlanLimits };
                    if (payload?.limits) setLimits(payload.limits);
                    setIsSubscribed(Boolean(payload?.isSubscribed));
                } catch {
                    // keep free limits
                }
            })();
        }
    }, [session, router]);

    const handleOpenDetail = (persona: Persona) => {
        setSelectedPersona(persona);
        setIsEditing(false);
        const rt = persona.runtime;
        const al = persona.analysis;
        const relation = rt?.relation || al?.personaInput?.relation || "";
        setSummaryPlaceholder(pickRandomSummaryPlaceholder(relation));

        setEditForm({
            name: persona.name,
            relation,
            callsUserAs: rt?.addressing?.callsUserAs?.[0] || al?.addressing?.callsUserAs?.[0] || "나",
            summary: rt?.summary || al?.analysisSummary?.oneLineSummary || "",
            frequentPhrases: rt?.expressions?.frequentPhrases || al?.textHabits?.frequentPhrases || [],
            tone: (rt?.style?.tone || al?.speechStyle?.baseTone || []).join(", "),

            politeness: rt?.style?.politeness || al?.speechStyle?.politeness || "편안한 반말",
            sentenceLength: rt?.style?.sentenceLength || al?.speechStyle?.sentenceLength || "적당한 길이",
            replyTempo: rt?.style?.replyTempo || al?.speechStyle?.responseTempo || "적당한 템포",
            empathyStyle: rt?.behavior?.empathyFirst === false ? "차분한 이성적 위로" : "감성 공감 우선",
            goal: toGoalLabel(rt?.goal || al?.conversationIntent?.primaryGoal),
            customGoalText: (rt?.customGoalText || al?.conversationIntent?.customGoalText || "").trim(),

            laughterPatterns: rt?.expressions?.laughterPatterns || al?.expressionStyle?.laughterPatterns || [],
            sadnessPatterns: rt?.expressions?.sadnessPatterns || al?.expressionStyle?.sadnessPatterns || [],
            memories: rt?.memories || al?.memoryAnchors?.map(m => m.summary) || [],
            avoidTopics: rt?.topics?.avoid || al?.topics?.avoidTopics || [],
        });
    };

    const handleSave = async () => {
        if (!selectedPersona || !editForm) return;
        setIsSaving(true);
        try {
            const updatedRuntime: PersonaRuntime = {
                ...(selectedPersona.runtime as PersonaRuntime),
                displayName: editForm.name,
                relation: editForm.relation,
                goal: toGoalValue(editForm.goal),
                customGoalText: toGoalValue(editForm.goal) === "custom" ? (editForm.customGoalText || "").trim() : "",
                summary: limits.summaryEditable ? editForm.summary : (selectedPersona.runtime?.summary || ""),
                addressing: {
                    ...(selectedPersona.runtime?.addressing || { callsUserAs: [], userCallsPersonaAs: [] }),
                    callsUserAs: [editForm.callsUserAs],
                },
                expressions: {
                    ...(selectedPersona.runtime?.expressions || { frequentPhrases: [], emojiExamples: [], laughterPatterns: [], sadnessPatterns: [], typoExamples: [] }),
                    frequentPhrases: editForm.frequentPhrases,
                    laughterPatterns: editForm.laughterPatterns,
                    sadnessPatterns: editForm.sadnessPatterns,
                },
                style: {
                    ...(selectedPersona.runtime?.style || { tone: [], politeness: "", sentenceLength: "", replyTempo: "", humorStyle: "" }),
                    tone: editForm.tone.split(",").map((t: string) => t.trim()).filter(Boolean),
                    politeness: editForm.politeness,
                    sentenceLength: editForm.sentenceLength,
                    replyTempo: editForm.replyTempo,
                },
                behavior: {
                    ...(selectedPersona.runtime?.behavior || { empathyFirst: true, feedbackStyle: "", preferredReplyLength: "", conflictStyle: "" }),
                    empathyFirst: editForm.empathyStyle === "감성 공감 우선",
                },
                memories: editForm.memories,
                topics: {
                    ...(selectedPersona.runtime?.topics || { frequent: [], avoid: [] }),
                    avoid: editForm.avoidTopics,
                }
            };

            const res = await fetch("/api/persona", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    personaId: selectedPersona.persona_id,
                    name: editForm.name,
                    avatarUrl: selectedPersona.avatar_url,
                    analysis: selectedPersona.analysis,
                    runtime: updatedRuntime,
                }),
            });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string };
            if (res.status === 402 || res.status === 403 || data?.code === "PREMIUM_REQUIRED") {
                goToPayment();
                return;
            }
            if (data.ok) {
                setPersonas(prev => prev.map(p =>
                    p.persona_id === selectedPersona.persona_id
                        ? { ...p, name: editForm.name, runtime: updatedRuntime as any }
                        : p
                ));
                setSelectedPersona(prev => prev ? ({ ...prev, name: editForm.name, runtime: updatedRuntime as any }) : null);
                setIsEditing(false);
            }
        } catch (err) {
            console.error("[persona-save] failed", err);
        } finally {
            setIsSaving(false);
        }
    };

    const closeDetail = () => {
        setSelectedPersona(null);
        setIsEditing(false);
    };

    const goToPayment = () => {
        router.push(`/payment?returnTo=${encodeURIComponent("/persona")}`);
    };

    const renderListEditor = (
        label: string,
        list: string[],
        setList: (next: string[]) => void,
        placeholder = "내용을 입력하세요",
        options?: { maxItems?: number; maxChars?: number; onLimitReached?: () => void },
    ) => (
        <div className="space-y-3">
            <label className="text-sm font-bold text-[#afb3ac] uppercase block mb-1">{label}</label>
            {list.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                    <input
                        type="text"
                        value={item}
                        placeholder={placeholder}
                        onChange={e => {
                            const next = [...list];
                            next[idx] = e.target.value.slice(0, options?.maxChars ?? 120);
                            setList(next);
                        }}
                        className="flex-1 rounded-xl bg-[#f4f4ef] px-4 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-[#4a626d]/20"
                    />
                    <button
                        onClick={() => setList(list.filter((_, i) => i !== idx))}
                        className="rounded-xl px-2 text-[#9f403d] hover:bg-[#9f403d]/10"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => {
                    const maxItems = options?.maxItems ?? 20;
                    if (list.length >= maxItems) {
                        options?.onLimitReached?.();
                        return;
                    }
                    setList([...list, ""]);
                }}
                className="w-full rounded-xl border border-dashed border-[#afb3ac] py-2 text-xs font-bold text-[#afb3ac] hover:text-[#4a626d] hover:border-[#4a626d] transition-all"
            >
                + 항목 추가하기
            </button>
            <p className="text-xs text-[#7f867f]">
                최대 {options?.maxItems ?? 20}개 · 항목당 최대 {options?.maxChars ?? 120}자
            </p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#faf9f5]">
            <Navigation />

            <main className="mx-auto max-w-5xl px-6 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-12 md:pt-20 md:pb-20 lg:pl-64">
                <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end text-center md:text-left">
                    <div className="w-full">
                        <h1 className="font-headline text-3xl font-bold text-[#2f342e]">내 기억</h1>
                        <p className="mt-2 text-[#655d5a]">소중한 기억의 파편을 관리하고, 대화의 결을 다듬을 수 있습니다.</p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex h-64 items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
                    </div>
                ) : personas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-[2.5rem] bg-white p-20 text-center shadow-sm border border-[#afb3ac]/10">
                        <div className="mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-[#f4f4ef] text-[#afb3ac]">
                            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-[#2f342e]">아직 생성된 기억이 없어요</h3>
                        <p className="mt-2 text-[#655d5a]">첫 기억을 만들어 대화를 시작해보세요.</p>
                        <button
                            onClick={() => router.push("/step-1")}
                            className="mt-8 rounded-2xl bg-[#4a626d] px-8 py-4 text-base font-bold text-white shadow-lg shadow-[#4a626d]/20 transition-transform active:scale-95"
                        >
                            기억 생성하러 가기
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {personas.map((persona) => (
                            <div
                                key={persona.persona_id}
                                onClick={() => handleOpenDetail(persona)}
                                className="group cursor-pointer overflow-hidden rounded-[2rem] bg-white p-6 shadow-sm transition-all border border-[#afb3ac]/10 hover:shadow-xl hover:-translate-y-1"
                            >
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#4a626d]/10">
                                        {persona.avatar_url ? (
                                            <img
                                                src={persona.avatar_url.includes("amazonaws.com") ? `/api/image-proxy?url=${encodeURIComponent(persona.avatar_url)}` : persona.avatar_url}
                                                alt={persona.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-[#4a626d]">
                                                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs font-medium text-[#afb3ac]">
                                        {new Date(persona.updated_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-[#2f342e]">{persona.name}</h3>
                                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#655d5a]">
                                    {persona.last_message_content || "대화 스타일과 특징을 확인하거나 수정하세요."}
                                </p>
                                <div className="mt-6 flex items-center justify-between border-t border-[#afb3ac]/10 pt-4">
                                    <span className="text-[12px] font-extrabold uppercase tracking-tight text-[#4a626d]">기억 확인 & 편집</span>
                                    <div className="h-6 w-6 rounded-full bg-[#f4f4ef] grid place-items-center group-hover:bg-[#4a626d] group-hover:text-white transition-colors">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Persona Detail & Edit Modal / Bottom Sheet on Mobile */}
            {selectedPersona && (
                <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-sm lg:items-center lg:p-5 animate-fade-in">
                    {/* Backdrop click to close */}
                    <div className="absolute inset-0" onClick={closeDetail} />

                    <div className="relative h-[90vh] w-full overflow-hidden rounded-t-[3rem] bg-[#faf9f5] shadow-2xl lg:max-w-5xl lg:rounded-[3rem] animate-slide-up flex flex-col border border-white/20">
                        {/* Drag Handle on Mobile */}
                        <div className="mx-auto mt-4 shrink-0 h-1.5 w-12 rounded-full bg-[#afb3ac]/30 lg:hidden" />

                        {/* Modal Header */}
                        <header className="flex shrink-0 items-center justify-between border-b border-[#afb3ac]/10 bg-[#faf9f5] px-8 py-6 lg:px-12">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#4a626d]/10">
                                    {selectedPersona.avatar_url ? (
                                        <img src={selectedPersona.avatar_url.includes("amazonaws.com") ? `/api/image-proxy?url=${encodeURIComponent(selectedPersona.avatar_url)}` : selectedPersona.avatar_url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[#4a626d]">
                                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="font-headline text-xl font-bold text-[#2f342e] truncate">{selectedPersona.name}와의 기억</h2>
                                    <p className="text-xs text-[#655d5a]">{isEditing ? "기억의 파편들을 직접 정교하게 다듬고 있습니다." : "AI가 분석한 대화 스타일과 특징을 확인하세요."}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {!isEditing ? (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="hidden lg:block rounded-3xl bg-[#655d5a] px-8 py-2.5 text-sm font-bold text-white hover:bg-[#524b49] transition-all active:scale-95 shadow-lg shadow-[#655d5a]/20"
                                    >
                                        수정
                                    </button>
                                ) : null}
                                <button onClick={closeDetail} className="rounded-full bg-[#f4f4ef] p-2 text-[#655d5a] hover:bg-[#9f403d]/10 hover:text-[#9f403d] transition-transform duration-200 active:scale-90">
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </header>

                        {/* Modal Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-8 lg:p-12 scrollbar-hide">
                            <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
                                {/* Left Section: Core Vibe & Settings */}
                                <div className="space-y-12">
                                    <section>
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">기초 정체성</h3>
                                        <div className="grid grid-cols-1 gap-4 rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
                                            <div className="space-y-6">
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div className="space-y-1">
                                                        <label className="text-sm font-extrabold text-[#655d5a] uppercase block mb-1">표시 이름</label>
                                                        {isEditing ? (
                                                            <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full rounded-2xl bg-[#f4f4ef] px-4 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-[#4a626d]/20 transition-all" />
                                                        ) : (
                                                            <p className="font-bold text-[#2f342e] text-2xl">{selectedPersona.name}</p>
                                                        )}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-sm font-extrabold text-[#655d5a] uppercase block mb-1">나를 부르는 호칭</label>
                                                        {isEditing ? (
                                                            <input type="text" value={editForm.callsUserAs} onChange={e => setEditForm({ ...editForm, callsUserAs: e.target.value })} className="w-full rounded-2xl bg-[#f4f4ef] px-4 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-[#4a626d]/20 transition-all" />
                                                        ) : (
                                                            <p className="font-bold text-[#2f342e] text-xl">{selectedPersona.runtime?.addressing?.callsUserAs?.[0] || "나"}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">대화 스타일</h3>
                                        <div className="grid grid-cols-1 gap-6 rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
                                            {isEditing ? (
                                                <div className="grid grid-cols-1 gap-6">
                                                    <CustomDropdown label="대화 목적" options={GOAL_LABELS} value={editForm.goal} onChange={(v) => setEditForm({ ...editForm, goal: v })} />
                                                    {editForm.goal === GOAL_VALUE_TO_LABEL.custom ? (
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-bold text-[#7b827d] uppercase block">직접 입력 내용</label>
                                                            <textarea
                                                                value={editForm.customGoalText || ""}
                                                                onChange={(e) => setEditForm({ ...editForm, customGoalText: e.target.value })}
                                                                placeholder="예: 답이 필요한 건 아니고, 그냥 내 얘기를 편하게 들어줬으면 좋겠어."
                                                                className="min-h-[96px] w-full resize-none rounded-2xl border border-[#afb3ac]/20 bg-[#f4f4ef] px-4 py-3 text-sm font-medium text-[#2f342e] placeholder:text-[#7f867f] focus:outline-none focus:ring-2 focus:ring-[#4a626d]/20"
                                                            />
                                                        </div>
                                                    ) : null}
                                                    <CustomDropdown label="정중함 정도" options={DROPDOWN_OPTIONS.politeness} value={editForm.politeness} onChange={(v) => setEditForm({ ...editForm, politeness: v })} />
                                                    <CustomDropdown label="공감 방식" options={DROPDOWN_OPTIONS.empathyStyle} value={editForm.empathyStyle} onChange={(v) => setEditForm({ ...editForm, empathyStyle: v })} />
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                                    {[
                                                        {
                                                            label: '대화 목적',
                                                            val:
                                                                selectedPersona.runtime?.goal === "custom"
                                                                    ? (selectedPersona.runtime?.customGoalText || "직접 입력")
                                                                    : toGoalLabel(selectedPersona.runtime?.goal),
                                                        },
                                                        { label: '정중함', val: selectedPersona.runtime?.style?.politeness },
                                                        { label: '공감 방식', val: selectedPersona.runtime?.behavior?.empathyFirst ? "감성 공감 우선" : "차분한 이성적 위로" }
                                                    ].map(item => (
                                                        <div key={item.label} className="space-y-1">
                                                            <span className="text-sm font-extrabold text-[#655d5a] uppercase block">{item.label}</span>
                                                            <p className="font-bold text-[#2f342e] text-xl">
                                                                {item.val || "미지정"}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">디지털 대화 습관</h3>
                                        <div className="space-y-6 rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
                                            {isEditing ? (
                                                <>
                                                    {renderListEditor("웃음 습관 (ㅋㅋ, ㅎㅎ 등)", editForm.laughterPatterns, (next) => setEditForm({ ...editForm, laughterPatterns: next }), "내용을 입력하세요", { maxItems: 20, maxChars: 30 })}
                                                    {renderListEditor("슬픔 습관 (ㅠㅠ, ... 등)", editForm.sadnessPatterns, (next) => setEditForm({ ...editForm, sadnessPatterns: next }), "내용을 입력하세요", { maxItems: 20, maxChars: 30 })}
                                                </>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="text-sm font-extrabold text-[#655d5a] mb-2 block uppercase">웃음 패턴</label>
                                                        <div className="flex flex-wrap gap-2 text-base font-bold text-[#2f342e]">
                                                            {(selectedPersona.runtime?.expressions?.laughterPatterns || []).join(", ") || "내역 없음"}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-extrabold text-[#655d5a] mb-2 block uppercase">슬픔 패턴</label>
                                                        <div className="flex flex-wrap gap-2 text-base font-bold text-[#2f342e]">
                                                            {(selectedPersona.runtime?.expressions?.sadnessPatterns || []).join(", ") || "내역 없음"}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* Right Section: Memory & Text */}
                                <div className="space-y-12">
                                    <section>
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">대화 핵심 성향 (서술형)</h3>
                                        <div className="rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
                                            {isEditing ? (
                                                limits.summaryEditable ? (
                                                    <textarea
                                                        value={editForm.summary}
                                                        onChange={e => setEditForm({ ...editForm, summary: e.target.value })}
                                                        placeholder={summaryPlaceholder}
                                                        className="w-full min-h-[140px] rounded-2xl bg-[#f4f4ef] px-5 py-4 text-base leading-relaxed font-medium focus:outline-none focus:ring-2 focus:ring-[#4a626d]/20 transition-all"
                                                    />
                                                ) : (
                                                    <div className="rounded-2xl border border-[#4a626d]/15 bg-[#f4f4ef] p-5 text-center">
                                                        <p className="text-sm font-semibold text-[#4a626d]">{MEMORY_PASS_REQUIRED_MESSAGE}</p>
                                                        <button
                                                            type="button"
                                                            onClick={goToPayment}
                                                            className="mt-4 rounded-2xl bg-[#4a626d] px-5 py-3 text-sm font-bold text-[#f0f9ff]"
                                                        >
                                                            기억 패스 등록하기
                                                        </button>
                                                    </div>
                                                )
                                            ) : (
                                                <p className="text-base leading-relaxed text-[#2f342e] font-medium">
                                                    {selectedPersona.runtime?.summary || selectedPersona.analysis?.analysisSummary?.oneLineSummary || "설정된 성향이 없습니다."}
                                                </p>
                                            )}
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">소중한 기억의 조각들</h3>
                                        <div className="rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
                                            {isEditing ? (
                                                renderListEditor(
                                                    "핵심 추억 리스트",
                                                    editForm.memories,
                                                    (next) => setEditForm({ ...editForm, memories: next }),
                                                    "예: 2019년 제주도 바닷가 산책",
                                                    {
                                                        maxItems: limits.memoryItemMaxCount,
                                                        maxChars: limits.memoryItemCharMax,
                                                        onLimitReached: isSubscribed ? undefined : goToPayment,
                                                    },
                                                )
                                            ) : (
                                                <div className="space-y-4">
                                                    {(selectedPersona.runtime?.memories || []).length > 0 ? (
                                                        (selectedPersona.runtime?.memories || []).map((memory, i) => (
                                                            <div key={i} className="flex items-start gap-4 py-5 border-b border-[#afb3ac]/20 last:border-0">
                                                                <svg className="h-5 w-5 shrink-0 text-[#4a626d] mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.456-2.455l.259-1.036.259 1.036a3.375 3.375 0 002.455 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                                                                </svg>
                                                                <p className="text-base font-medium text-[#2f342e] leading-relaxed">{memory}</p>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <p className="text-sm text-[#afb3ac] italic">아직 공유된 기억이 없습니다.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">입버릇처럼 달고 살던 말</h3>
                                        <div className="rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
                                            {isEditing ? (
                                                renderListEditor(
                                                    "자주 쓰는 문구",
                                                    editForm.frequentPhrases,
                                                    (next) => setEditForm({ ...editForm, frequentPhrases: next }),
                                                    "예: 밥 먹었어?",
                                                    {
                                                        maxItems: limits.phraseItemMaxCount,
                                                        maxChars: limits.phraseItemCharMax,
                                                        onLimitReached: isSubscribed ? undefined : goToPayment,
                                                    },
                                                )
                                            ) : (
                                                <div className="flex flex-wrap gap-3">
                                                    {(selectedPersona.runtime?.expressions?.frequentPhrases || []).map((phrase, i) => (
                                                        <span key={i} className="rounded-2xl bg-[#f4f4ef] px-4 py-2.5 text-base font-bold text-[#4a626d] border border-[#4a626d]/5 shadow-sm">
                                                            "{phrase}"
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <footer className="shrink-0 bg-white border-t border-[#afb3ac]/10 p-6 lg:px-12 flex justify-between items-center">
                            <div className="flex justify-end gap-3 ml-auto w-full md:w-auto pb-safe">
                                {!isEditing ? (
                                    <div className="grid w-full grid-cols-2 gap-3 pb-safe md:flex md:w-auto md:justify-end">
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="rounded-3xl bg-[#655d5a] px-6 py-4 text-sm font-extrabold text-white md:hidden transition-all shadow-lg shadow-[#655d5a]/20 active:scale-95"
                                        >
                                            수정
                                        </button>
                                        <button
                                            onClick={closeDetail}
                                            className="hidden md:block rounded-2xl px-6 py-3.5 text-sm font-bold text-[#655d5a] hover:bg-[#f4f4ef] transition-colors"
                                        >
                                            닫기
                                        </button>
                                        <button
                                            onClick={() => router.push(`/chat?id=${selectedPersona.persona_id}`)}
                                            className="w-full md:w-auto rounded-3xl bg-[#4a626d] px-10 py-4 text-sm font-extrabold text-white shadow-xl shadow-[#4a626d]/20 hover:shadow-2xl hover:scale-[1.02] active:scale-95 transition-all text-center"
                                        >
                                            대화 시작하기
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid w-full grid-cols-2 gap-3 pb-safe md:flex md:w-auto md:justify-end">
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            className="rounded-2xl bg-[#f4f4ef] px-6 py-4 text-sm font-bold text-[#655d5a] md:py-3 transition-colors"
                                        >
                                            취소
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="rounded-2xl bg-[#4a626d] px-6 py-4 text-sm font-extrabold text-white shadow-xl shadow-[#4a626d]/30 md:py-3 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                        >
                                            {isSaving ? (
                                                <div className="h-4 w-4 animate-spin rounded-full border-3 border-white border-t-transparent" />
                                            ) : "저장하기"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}
