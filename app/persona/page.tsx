"use client";

import { useEffect, useMemo, useState, useRef, type ChangeEvent, type FocusEvent, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/app/_components/Navigation";
import { useSession } from "next-auth/react";
import { PersonaAnalysis, PersonaRuntime, PrimaryGoal } from "@/types/persona";
import { FREE_PLAN_LIMITS, PlanLimits } from "@/lib/memory-pass/config";
import useMemoryCreateGuard from "@/app/_components/useMemoryCreateGuard";
import MemoryPassExpiredLockOverlay from "@/app/_components/MemoryPassExpiredLockOverlay";
import {
    CONVERSATION_TENSION_OPTIONS,
    normalizeConversationTension,
} from "@/lib/persona/conversationTension";

type Persona = {
    persona_id: string;
    name: string;
    avatar_url: string | null;
    is_locked?: boolean;
    is_primary_unlocked?: boolean;
    created_at?: string;
    updated_at: string;
    last_message_content: string | null;
    analysis?: PersonaAnalysis;
    runtime?: PersonaRuntime;
};

type EditSnapshot = {
    name: string;
    relation: string;
    callsUserAs: string;
    frequentPhrases: string[];
    tone: string[];
    politeness: string;
    sentenceLength: string;
    replyTempo: string;
    empathyStyle: string;
    goal: string;
    customGoalText: string;
    laughterPatterns: string[];
    sadnessPatterns: string[];
    memories: string[];
    avoidTopics: string[];
    avatarUrl: string;
};

const DROPDOWN_OPTIONS = {
    politeness: [...CONVERSATION_TENSION_OPTIONS],
    sentenceLength: ["짧고 간결한 단답", "적당한 길이", "아주 길고 자세하게"],
    replyTempo: ["성격 급한 즉답형", "적당한 템포", "신중하고 느린 편"],
    empathyStyle: ["감성 공감 우선", "차분한 이성적 위로", "해결책 중심의 조언"],
};

const GOAL_VALUE_TO_LABEL: Record<PrimaryGoal, string> = {
    comfort: "위로받고 싶어요",
    memory: "추억을 떠올리고 싶어요",
    unfinished_words: "못다 한 말을 해보고 싶어요",
    casual_talk: "평소처럼 대화하고 싶어요",
    custom: "아무 말이나 편하게 나누고 싶어요",
};
const LEGACY_CUSTOM_GOAL_LABEL = "직접 입력";

const GOAL_LABELS = Object.values(GOAL_VALUE_TO_LABEL);
const SHEET_CLOSE_SWIPE_THRESHOLD = 72;
const MEMORY_ITEM_CHAR_LIMIT = 50;
const BRAND_BORDER_COLOR = "#3e5560";

function resolveAvatarPreviewUrl(avatarUrl: string | null | undefined) {
    if (!avatarUrl) return "";
    return avatarUrl.includes("amazonaws.com") ? `/api/image-proxy?url=${encodeURIComponent(avatarUrl)}` : avatarUrl;
}

function normalizeSnapshotText(value: unknown) {
    return String(value ?? "").trim();
}

function normalizeSnapshotList(values: unknown) {
    if (!Array.isArray(values)) return [] as string[];
    return values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
}

function splitToneToList(value: unknown) {
    if (Array.isArray(value)) return normalizeSnapshotList(value);
    return String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function arraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function isEditSnapshotEqual(a: EditSnapshot | null, b: EditSnapshot | null) {
    if (!a || !b) return false;
    return (
        a.name === b.name &&
        a.relation === b.relation &&
        a.callsUserAs === b.callsUserAs &&
        arraysEqual(a.frequentPhrases, b.frequentPhrases) &&
        arraysEqual(a.tone, b.tone) &&
        a.politeness === b.politeness &&
        a.sentenceLength === b.sentenceLength &&
        a.replyTempo === b.replyTempo &&
        a.empathyStyle === b.empathyStyle &&
        a.goal === b.goal &&
        a.customGoalText === b.customGoalText &&
        arraysEqual(a.laughterPatterns, b.laughterPatterns) &&
        arraysEqual(a.sadnessPatterns, b.sadnessPatterns) &&
        arraysEqual(a.memories, b.memories) &&
        arraysEqual(a.avoidTopics, b.avoidTopics) &&
        a.avatarUrl === b.avatarUrl
    );
}

function buildSnapshotFromPersona(persona: Persona): EditSnapshot {
    const rt = persona.runtime;
    const al = persona.analysis;
    const resolvedGoal = resolveGoalSelection({
        runtimeGoal: rt?.goal,
        analysisGoal: al?.conversationIntent?.primaryGoal,
        runtimeCustomGoalText: rt?.customGoalText,
        analysisCustomGoalText: al?.conversationIntent?.customGoalText,
    });
    const resolvedGoalLabel = toGoalLabel(resolvedGoal.goal);
    return {
        name: normalizeSnapshotText(persona.name),
        relation: normalizeSnapshotText(rt?.relation || al?.personaInput?.relation || ""),
        callsUserAs: normalizeSnapshotText(rt?.addressing?.callsUserAs?.[0] || al?.addressing?.callsUserAs?.[0] || "나"),
        frequentPhrases: normalizeSnapshotList(rt?.expressions?.frequentPhrases || al?.textHabits?.frequentPhrases || []),
        tone: normalizeSnapshotList(rt?.style?.tone || al?.speechStyle?.baseTone || []),
        politeness: normalizeConversationTension(rt?.style?.politeness || al?.speechStyle?.politeness || ""),
        sentenceLength: normalizeSnapshotText(rt?.style?.sentenceLength || al?.speechStyle?.sentenceLength || "적당한 길이"),
        replyTempo: normalizeSnapshotText(rt?.style?.replyTempo || al?.speechStyle?.responseTempo || "적당한 템포"),
        empathyStyle: rt?.behavior?.empathyFirst === false ? "차분한 이성적 위로" : "감성 공감 우선",
        goal: resolvedGoalLabel,
        customGoalText: resolvedGoalLabel === GOAL_VALUE_TO_LABEL.custom ? resolvedGoal.customGoalText : "",
        laughterPatterns: normalizeSnapshotList(rt?.expressions?.laughterPatterns || al?.expressionStyle?.laughterPatterns || []),
        sadnessPatterns: normalizeSnapshotList(rt?.expressions?.sadnessPatterns || al?.expressionStyle?.sadnessPatterns || []),
        memories: normalizeSnapshotList(rt?.memories || al?.memoryAnchors?.map((m) => m.summary) || []),
        avoidTopics: normalizeSnapshotList(rt?.topics?.avoid || al?.topics?.avoidTopics || []),
        avatarUrl: normalizeSnapshotText(persona.avatar_url),
    };
}

function buildSnapshotFromEditForm(editForm: any, avatarUrl: string | null): EditSnapshot {
    const goalLabel = normalizeSnapshotText(editForm?.goal) || GOAL_VALUE_TO_LABEL.casual_talk;
    return {
        name: normalizeSnapshotText(editForm?.name),
        relation: normalizeSnapshotText(editForm?.relation),
        callsUserAs: normalizeSnapshotText(editForm?.callsUserAs),
        frequentPhrases: normalizeSnapshotList(editForm?.frequentPhrases),
        tone: splitToneToList(editForm?.tone),
        politeness: normalizeConversationTension(normalizeSnapshotText(editForm?.politeness)),
        sentenceLength: normalizeSnapshotText(editForm?.sentenceLength),
        replyTempo: normalizeSnapshotText(editForm?.replyTempo),
        empathyStyle: normalizeSnapshotText(editForm?.empathyStyle),
        goal: goalLabel,
        customGoalText: goalLabel === GOAL_VALUE_TO_LABEL.custom ? normalizeSnapshotText(editForm?.customGoalText) : "",
        laughterPatterns: normalizeSnapshotList(editForm?.laughterPatterns),
        sadnessPatterns: normalizeSnapshotList(editForm?.sadnessPatterns),
        memories: normalizeSnapshotList(editForm?.memories),
        avoidTopics: normalizeSnapshotList(editForm?.avoidTopics),
        avatarUrl: normalizeSnapshotText(avatarUrl),
    };
}

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
    if (!(target instanceof HTMLElement)) return false;
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

function readNativeKeyboardInset() {
    const raw =
        document.documentElement.style.getPropertyValue("--bogopa-keyboard-height") ||
        window.getComputedStyle(document.documentElement).getPropertyValue("--bogopa-keyboard-height");
    const parsed = Number.parseFloat(raw || "0");
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeGoalValue(value?: string | null): PrimaryGoal | null {
    const normalized = String(value ?? "").trim();
    if (!normalized) return null;

    if (
        normalized === "comfort" ||
        normalized === "memory" ||
        normalized === "unfinished_words" ||
        normalized === "casual_talk" ||
        normalized === "custom"
    ) {
        return normalized as PrimaryGoal;
    }

    if (normalized === "unfinished") return "unfinished_words";
    if (normalized === "daily") return "casual_talk";

    if (normalized === LEGACY_CUSTOM_GOAL_LABEL) return "custom";

    const byLabel = Object.entries(GOAL_VALUE_TO_LABEL).find(([, text]) => text === normalized);
    if (byLabel) return byLabel[0] as PrimaryGoal;

    return null;
}

function resolveGoalSelection(params: {
    runtimeGoal?: string | null;
    analysisGoal?: string | null;
    runtimeCustomGoalText?: string | null;
    analysisCustomGoalText?: string | null;
}) {
    const runtimeGoal = normalizeGoalValue(params.runtimeGoal);
    const analysisGoal = normalizeGoalValue(params.analysisGoal);
    const runtimeCustomGoalText = (params.runtimeCustomGoalText || "").trim();
    const analysisCustomGoalText = (params.analysisCustomGoalText || "").trim();

    if (runtimeGoal === "custom") {
        if (runtimeCustomGoalText) {
            return { goal: "custom" as PrimaryGoal, customGoalText: runtimeCustomGoalText };
        }
        if (analysisGoal && analysisGoal !== "custom") {
            return { goal: analysisGoal, customGoalText: "" };
        }
        return {
            goal: "custom" as PrimaryGoal,
            customGoalText: analysisCustomGoalText,
        };
    }

    if (runtimeGoal) {
        return {
            goal: runtimeGoal,
            customGoalText: "",
        };
    }

    if (analysisGoal) {
        return {
            goal: analysisGoal,
            customGoalText: analysisGoal === "custom" ? (analysisCustomGoalText || runtimeCustomGoalText) : "",
        };
    }

    return { goal: "casual_talk" as PrimaryGoal, customGoalText: "" };
}

function toGoalLabel(value?: string) {
    const normalized = normalizeGoalValue(value);
    if (!normalized) return GOAL_VALUE_TO_LABEL.casual_talk;
    return GOAL_VALUE_TO_LABEL[normalized];
}

function toGoalValue(label?: string): PrimaryGoal {
    const normalized = normalizeGoalValue(label);
    if (normalized) return normalized;
    const entry = Object.entries(GOAL_VALUE_TO_LABEL).find(([, text]) => text === label);
    if (!entry) return "casual_talk";
    return entry[0] as PrimaryGoal;
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
    const [isEditInputFocused, setIsEditInputFocused] = useState(false);
    const [editForm, setEditForm] = useState<any>(null);
    const [initialEditSnapshot, setInitialEditSnapshot] = useState<EditSnapshot | null>(null);
    const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null);
    const [isAvatarUploading, setIsAvatarUploading] = useState(false);
    const [avatarUploadError, setAvatarUploadError] = useState("");
    const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [limits, setLimits] = useState<PlanLimits>(FREE_PLAN_LIMITS);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [lockedPersonaName, setLockedPersonaName] = useState("");
    const [isNativeAppRuntime, setIsNativeAppRuntime] = useState(false);
    const [isDetailHandleDragging, setIsDetailHandleDragging] = useState(false);
    const detailSwipeStartYRef = useRef<number | null>(null);
    const detailSwipeLastYRef = useRef<number | null>(null);
    const detailContentScrollRef = useRef<HTMLDivElement | null>(null);
    const detailRevealTimersRef = useRef<number[]>([]);
    const detailRevealRafRef = useRef<number | null>(null);
    const detailBodyLockRef = useRef<{
        scrollY: number;
        bodyPosition: string;
        bodyTop: string;
        bodyLeft: string;
        bodyRight: string;
        bodyWidth: string;
        bodyOverflow: string;
        htmlOverflow: string;
    } | null>(null);
    const { guardCreateStart, modalNode, isChecking } = useMemoryCreateGuard();

    useEffect(() => {
        setIsNativeAppRuntime(document.documentElement.classList.contains("native-app"));
    }, []);

    useEffect(() => {
        if (selectedPersona) {
            document.body.classList.add("modal-open");
            document.documentElement.classList.add("modal-open");
            if (!detailBodyLockRef.current) {
                const body = document.body;
                const html = document.documentElement;
                const scrollY = window.scrollY;
                detailBodyLockRef.current = {
                    scrollY,
                    bodyPosition: body.style.position,
                    bodyTop: body.style.top,
                    bodyLeft: body.style.left,
                    bodyRight: body.style.right,
                    bodyWidth: body.style.width,
                    bodyOverflow: body.style.overflow,
                    htmlOverflow: html.style.overflow,
                };
                body.style.position = "fixed";
                body.style.top = `-${scrollY}px`;
                body.style.left = "0";
                body.style.right = "0";
                body.style.width = "100%";
                body.style.overflow = "hidden";
                html.style.overflow = "hidden";
            }
        } else {
            document.body.classList.remove("modal-open");
            document.documentElement.classList.remove("modal-open");
            setIsEditInputFocused(false);
            setIsDetailHandleDragging(false);
            clearDetailRevealSchedule();
            detailSwipeStartYRef.current = null;
            detailSwipeLastYRef.current = null;
            if (detailBodyLockRef.current) {
                const body = document.body;
                const html = document.documentElement;
                const prev = detailBodyLockRef.current;
                body.style.position = prev.bodyPosition;
                body.style.top = prev.bodyTop;
                body.style.left = prev.bodyLeft;
                body.style.right = prev.bodyRight;
                body.style.width = prev.bodyWidth;
                body.style.overflow = prev.bodyOverflow;
                html.style.overflow = prev.htmlOverflow;
                window.scrollTo(0, prev.scrollY);
                detailBodyLockRef.current = null;
            }
        }
        return () => {
            document.body.classList.remove("modal-open");
            document.documentElement.classList.remove("modal-open");
            clearDetailRevealSchedule();
            if (detailBodyLockRef.current) {
                const body = document.body;
                const html = document.documentElement;
                const prev = detailBodyLockRef.current;
                body.style.position = prev.bodyPosition;
                body.style.top = prev.bodyTop;
                body.style.left = prev.bodyLeft;
                body.style.right = prev.bodyRight;
                body.style.width = prev.bodyWidth;
                body.style.overflow = prev.bodyOverflow;
                html.style.overflow = prev.htmlOverflow;
                window.scrollTo(0, prev.scrollY);
                detailBodyLockRef.current = null;
            }
        };
    }, [selectedPersona]);

    function clearDetailRevealSchedule() {
        if (detailRevealRafRef.current !== null) {
            window.cancelAnimationFrame(detailRevealRafRef.current);
            detailRevealRafRef.current = null;
        }
        while (detailRevealTimersRef.current.length > 0) {
            const timer = detailRevealTimersRef.current.pop();
            if (typeof timer === "number") {
                window.clearTimeout(timer);
            }
        }
    }

    function handleDetailSheetSwipeStart(event: TouchEvent<HTMLDivElement>) {
        if (event.touches.length !== 1) return;
        const y = event.touches[0].clientY;
        detailSwipeStartYRef.current = y;
        detailSwipeLastYRef.current = y;
        setIsDetailHandleDragging(true);
    }

    function handleDetailSheetSwipeMove(event: TouchEvent<HTMLDivElement>) {
        if (!isDetailHandleDragging || event.touches.length !== 1) return;
        const y = event.touches[0].clientY;
        detailSwipeLastYRef.current = y;
        if (y > (detailSwipeStartYRef.current ?? y)) {
            event.preventDefault();
        }
    }

    function handleDetailSheetSwipeEnd() {
        const startY = detailSwipeStartYRef.current;
        const endY = detailSwipeLastYRef.current;
        const deltaY = startY !== null && endY !== null ? endY - startY : 0;

        setIsDetailHandleDragging(false);
        detailSwipeStartYRef.current = null;
        detailSwipeLastYRef.current = null;

        if (deltaY > SHEET_CLOSE_SWIPE_THRESHOLD) {
            closeDetail();
        }
    }

    function scrollEditableIntoView(target: HTMLElement, smooth = true) {
        const scroller = detailContentScrollRef.current;
        if (!scroller) return;
        if (!scroller.contains(target)) return;

        target.scrollIntoView({
            behavior: "auto",
            block: "nearest",
            inline: "nearest",
        });

        const viewport = window.visualViewport;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportHeight = viewport?.height ?? window.innerHeight;
        const viewportBottomBase = viewportTop + viewportHeight;
        const viewportKeyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
        const nativeKeyboardInset = readNativeKeyboardInset();
        const fallbackKeyboardInset =
            document.documentElement.classList.contains("native-app") &&
            viewportKeyboardInset < 20 &&
            nativeKeyboardInset < 20
                ? 320
                : 0;
        const effectiveKeyboardInset = Math.max(viewportKeyboardInset, nativeKeyboardInset, fallbackKeyboardInset);
        const viewportBottom = Math.max(viewportTop, viewportBottomBase - effectiveKeyboardInset);
        const targetRect = target.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const topSafe = Math.max(scrollerRect.top + 12, viewportTop + 8);
        const bottomSafe = viewportBottom - 14;

        let delta = 0;
        if (targetRect.bottom > bottomSafe) {
            delta = targetRect.bottom - bottomSafe + 10;
        } else if (targetRect.top < topSafe) {
            delta = targetRect.top - topSafe - 10;
        }

        if (Math.abs(delta) > 1) {
            scroller.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
        }
    }

    function scheduleDetailReveal(target: HTMLElement) {
        if (!isEditing) return;
        clearDetailRevealSchedule();

        const runAuto = () => scrollEditableIntoView(target, false);
        const runSmooth = () => scrollEditableIntoView(target, true);

        detailRevealRafRef.current = window.requestAnimationFrame(runAuto);

        [60, 140, 260, 420, 620].forEach((delay) => {
            const id = window.setTimeout(runAuto, delay);
            detailRevealTimersRef.current.push(id);
        });

        const smoothId = window.setTimeout(runSmooth, 760);
        detailRevealTimersRef.current.push(smoothId);
    }

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
                    const sorted = [...data.personas].sort((a: Persona, b: Persona) => {
                        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
                        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
                        return bCreated - aCreated;
                    });
                    setPersonas(sorted);
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
        if (persona.is_locked) {
            setLockedPersonaName(persona.name || "이 기억");
            return;
        }
        setSelectedPersona(persona);
        setIsEditing(false);
        setIsEditInputFocused(false);
        setEditAvatarUrl(persona.avatar_url || null);
        setInitialEditSnapshot(buildSnapshotFromPersona(persona));
        setAvatarUploadError("");
        setIsAvatarUploading(false);
        const rt = persona.runtime;
        const al = persona.analysis;
        const relation = rt?.relation || al?.personaInput?.relation || "";
        const resolvedGoal = resolveGoalSelection({
            runtimeGoal: rt?.goal,
            analysisGoal: al?.conversationIntent?.primaryGoal,
            runtimeCustomGoalText: rt?.customGoalText,
            analysisCustomGoalText: al?.conversationIntent?.customGoalText,
        });

        setEditForm({
            name: persona.name,
            relation,
            callsUserAs: rt?.addressing?.callsUserAs?.[0] || al?.addressing?.callsUserAs?.[0] || "나",
            frequentPhrases: rt?.expressions?.frequentPhrases || al?.textHabits?.frequentPhrases || [],
            tone: (rt?.style?.tone || al?.speechStyle?.baseTone || []).join(", "),

            politeness: normalizeConversationTension(rt?.style?.politeness || al?.speechStyle?.politeness || ""),
            sentenceLength: rt?.style?.sentenceLength || al?.speechStyle?.sentenceLength || "적당한 길이",
            replyTempo: rt?.style?.replyTempo || al?.speechStyle?.responseTempo || "적당한 템포",
            empathyStyle: rt?.behavior?.empathyFirst === false ? "차분한 이성적 위로" : "감성 공감 우선",
            goal: toGoalLabel(resolvedGoal.goal),
            customGoalText: resolvedGoal.customGoalText,

            laughterPatterns: rt?.expressions?.laughterPatterns || al?.expressionStyle?.laughterPatterns || [],
            sadnessPatterns: rt?.expressions?.sadnessPatterns || al?.expressionStyle?.sadnessPatterns || [],
            memories: rt?.memories || al?.memoryAnchors?.map(m => m.summary) || [],
            avoidTopics: rt?.topics?.avoid || al?.topics?.avoidTopics || [],
        });
    };

    const hasPendingChanges = useMemo(() => {
        if (!isEditing || !editForm || !initialEditSnapshot) return false;
        const current = buildSnapshotFromEditForm(editForm, editAvatarUrl);
        return !isEditSnapshotEqual(initialEditSnapshot, current);
    }, [isEditing, editForm, editAvatarUrl, initialEditSnapshot]);

    const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setAvatarUploadError("");
        setIsAvatarUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/upload/persona-image", {
                method: "POST",
                body: formData,
            });
            const payload = (await response.json().catch(() => ({}))) as {
                ok?: boolean;
                avatarUrl?: string;
                url?: string;
                error?: string;
            };
            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || "이미지 업로드에 실패했습니다.");
            }

            const uploadedUrl = (payload.avatarUrl || payload.url || "").trim();
            if (!uploadedUrl) {
                throw new Error("업로드된 이미지 URL을 확인할 수 없습니다.");
            }
            setEditAvatarUrl(uploadedUrl);
        } catch (error) {
            setAvatarUploadError(error instanceof Error ? error.message : "이미지 업로드 중 오류가 발생했습니다.");
        } finally {
            setIsAvatarUploading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedPersona || !editForm) return;
        if (!hasPendingChanges) return;
        setIsSaving(true);
        try {
            const updatedRuntime: PersonaRuntime = {
                ...(selectedPersona.runtime as PersonaRuntime),
                displayName: editForm.name,
                relation: editForm.relation,
                goal: toGoalValue(editForm.goal),
                customGoalText: toGoalValue(editForm.goal) === "custom" ? (editForm.customGoalText || "").trim() : "",
                summary: "",
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
                    politeness: normalizeConversationTension(editForm.politeness),
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
                    avatarUrl: editAvatarUrl || null,
                    analysis: selectedPersona.analysis,
                    runtime: updatedRuntime,
                }),
            });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string };
            if (res.status === 403 && data?.code === "MEMORY_PASS_EXPIRED_LOCKED_PERSONA") {
                setLockedPersonaName(selectedPersona.name || "이 기억");
                return;
            }
            if (res.status === 402 || res.status === 403 || data?.code === "PREMIUM_REQUIRED") {
                goToPayment();
                return;
            }
            if (data.ok) {
                const nextSnapshot = buildSnapshotFromEditForm(editForm, editAvatarUrl);
                setPersonas(prev => prev.map(p =>
                    p.persona_id === selectedPersona.persona_id
                        ? { ...p, name: editForm.name, avatar_url: editAvatarUrl || null, runtime: updatedRuntime as any }
                        : p
                ));
                setSelectedPersona(prev => prev ? ({ ...prev, name: editForm.name, avatar_url: editAvatarUrl || null, runtime: updatedRuntime as any }) : null);
                setInitialEditSnapshot(nextSnapshot);
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
        setIsEditInputFocused(false);
        setInitialEditSnapshot(null);
        setEditAvatarUrl(null);
        setAvatarUploadError("");
        setIsAvatarUploading(false);
    };

    useEffect(() => {
        if (!isEditing) {
            setIsEditInputFocused(false);
            clearDetailRevealSchedule();
        }
    }, [isEditing]);

    function handleDetailEditorFocusCapture(event: FocusEvent<HTMLDivElement>) {
        if (!isEditing) return;
        if (isEditableTarget(event.target)) {
            setIsEditInputFocused(true);
            scheduleDetailReveal(event.target);
        }
    }

    function handleDetailEditorBlurCapture(event: FocusEvent<HTMLDivElement>) {
        if (!isEditing) return;
        const container = event.currentTarget;
        window.requestAnimationFrame(() => {
            const active = document.activeElement;
            const shouldKeepHidden =
                active instanceof HTMLElement && container.contains(active) && isEditableTarget(active);
            if (!shouldKeepHidden) {
                setIsEditInputFocused(false);
            }
        });
    }

    useEffect(() => {
        if (!selectedPersona || !isEditing || !isEditInputFocused) return;

        const onViewportChanged = () => {
            const active = document.activeElement;
            if (!isEditableTarget(active)) return;
            scheduleDetailReveal(active);
        };

        window.addEventListener("resize", onViewportChanged);
        window.visualViewport?.addEventListener("resize", onViewportChanged);
        window.visualViewport?.addEventListener("scroll", onViewportChanged);

        return () => {
            window.removeEventListener("resize", onViewportChanged);
            window.visualViewport?.removeEventListener("resize", onViewportChanged);
            window.visualViewport?.removeEventListener("scroll", onViewportChanged);
            clearDetailRevealSchedule();
        };
    }, [selectedPersona, isEditing, isEditInputFocused]);

    const goToPayment = () => {
        router.push(`/payment?returnTo=${encodeURIComponent("/persona")}`);
    };

    const detailAvatarUrl = editAvatarUrl ?? selectedPersona?.avatar_url ?? null;
    const detailAvatarSrc = resolveAvatarPreviewUrl(detailAvatarUrl);

    const renderListEditor = (
        label: string,
        list: string[],
        setList: (next: string[]) => void,
        placeholder = "내용을 입력하세요",
        options?: { maxItems?: number; maxChars?: number; onLimitReached?: () => void },
    ) => (
        <div className="space-y-3">
            <label className="text-sm font-bold text-[#4a626d] uppercase block mb-1">{label}</label>
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
                        className="flex-1 rounded-xl border border-[#afb3ac]/45 bg-[#f4f4ef] px-4 py-3 text-base font-bold text-[#2f342e] placeholder:text-[#7f867f] focus:outline-none focus:border-2 focus:border-[#4a626d] focus:ring-0"
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
                className="w-full rounded-xl border border-dashed border-[#4a626d]/40 py-3.5 text-sm font-bold text-[#4a626d] hover:text-[#3e5560] hover:border-[#3e5560] transition-all"
            >
                + 항목 추가하기
            </button>
            <p className="text-xs text-[#5d605a]">
                최대 {options?.maxItems ?? 20}개 · 항목당 최대 {options?.maxChars ?? 120}자
            </p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#faf9f5]">
            <Navigation />

            <header className="fixed top-0 z-40 w-full border-b border-[#d6ddd8] bg-[#ffffff]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
                <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-center px-3 md:px-6">
                    <h1 className="font-headline text-lg font-bold tracking-tight text-[#4a626d]">내 기억</h1>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-3 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[calc(5.75rem+env(safe-area-inset-top))] md:px-6 md:pt-20 md:pb-20 lg:pl-64">
                <header className="mb-10 hidden text-center lg:block">
                    <h1 className="font-headline text-lg font-bold tracking-tight text-[#4a626d]">내 기억</h1>
                </header>

                <div className="mb-6 flex justify-center">
                    <button
                        type="button"
                        onClick={() => router.push("/letters/inbox")}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#4a626d] px-5 py-3 text-sm font-extrabold text-[#f0f9ff] shadow-[0_10px_24px_rgba(47,52,46,0.22)] transition-all hover:bg-[#3e5661] active:scale-95"
                    >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
                            <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
                            <path d="m4.8 7.5 7.2 6 7.2-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        편지 보관함 가기
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex h-64 items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
                    </div>
                ) : personas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-[2.5rem] border bg-white px-6 py-20 text-center shadow-sm" style={{ borderColor: BRAND_BORDER_COLOR }}>
                        <div className="mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-[#f4f4ef] text-[#afb3ac]">
                            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-[#2f342e]">아직 생성된 기억이 없어요</h3>
                        <p className="mt-2 text-[#655d5a]">첫 기억을 만들어 대화를 시작해보세요.</p>
                        <button
                            onClick={() => {
                                void guardCreateStart({
                                    returnTo: "/persona",
                                    onAllowed: () => router.push("/step-1/start"),
                                });
                            }}
                            disabled={isChecking}
                            className="mt-8 rounded-2xl bg-[#4a626d] px-8 py-4 text-base font-bold text-white shadow-lg shadow-[#4a626d]/20 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
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
                                className="group cursor-pointer overflow-hidden rounded-[2rem] bg-white p-4 transition-all hover:-translate-y-1"
                                style={{ boxShadow: "0 12px 30px rgba(47,52,46,0.14)" }}
                            >
                                {(() => {
                                    const relationText =
                                        persona.runtime?.relation?.trim() ||
                                        persona.analysis?.personaInput?.relation?.trim() ||
                                        "관계 미설정";

                                    return (
                                        <>
                                <div className="flex min-h-[172px] items-stretch gap-4">
                                    <div className="w-[44%] min-w-[132px] shrink-0 overflow-hidden rounded-2xl bg-[#4a626d]/10">
                                            {persona.avatar_url ? (
                                                <img
                                                    src={persona.avatar_url.includes("amazonaws.com") ? `/api/image-proxy?url=${encodeURIComponent(persona.avatar_url)}` : persona.avatar_url}
                                                    alt={persona.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-[#4a626d]">
                                                    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                    </svg>
                                                </div>
                                            )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex h-full flex-col justify-between">
                                            <div className="min-w-0">
                                                <h3 className="truncate text-xl font-bold text-[#2f342e]">{persona.name}</h3>
                                                <p className="mt-1 truncate text-sm font-semibold text-[#655d5a]">{relationText}</p>
                                                <span className="mt-2 block text-xs font-medium text-[#2f342e]">
                                                    {new Date(persona.updated_at).toLocaleDateString()}
                                                </span>
                                                {persona.is_locked ? (
                                                    <span className="mt-2 inline-flex rounded-full bg-[#f2f4f7] px-2 py-1 text-[10px] font-extrabold text-[#344054]">
                                                        잠금
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="no-brand-border mt-4 border-t border-[#d6ddd8] pt-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-extrabold uppercase tracking-tight text-[#4a626d]">기억 확인 & 편집</span>
                                                    <div className="grid h-6 w-6 place-items-center rounded-full bg-[#f4f4ef] transition-colors group-hover:bg-[#4a626d] group-hover:text-white">
                                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                        </>
                                    );
                                })()}
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

                    <div
                        className="relative h-[90vh] w-full overflow-hidden rounded-t-[3rem] bg-[#faf9f5] shadow-2xl lg:max-w-5xl lg:rounded-[3rem] animate-slide-up flex flex-col"
                        onFocusCapture={handleDetailEditorFocusCapture}
                        onBlurCapture={handleDetailEditorBlurCapture}
                    >
                        {/* Drag Handle on Mobile */}
                        <div
                            className="mx-auto mt-3 flex w-full shrink-0 touch-none justify-center pb-2 lg:hidden"
                            onTouchStart={handleDetailSheetSwipeStart}
                            onTouchMove={handleDetailSheetSwipeMove}
                            onTouchEnd={handleDetailSheetSwipeEnd}
                            onTouchCancel={handleDetailSheetSwipeEnd}
                        >
                            <div
                                className={`h-1.5 rounded-full transition-all ${isDetailHandleDragging ? "w-16 bg-[#8a928d]/55" : "w-12 bg-[#afb3ac]/30"
                                    }`}
                            />
                        </div>

                        {/* Modal Header */}
                        <header className="flex shrink-0 items-center justify-between border-b border-[#afb3ac]/10 bg-[#faf9f5] px-8 py-6 lg:px-12">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#4a626d]/10">
                                    {detailAvatarSrc ? (
                                        <img src={detailAvatarSrc} alt="" className="h-full w-full object-cover" />
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
                                    <p className="text-xs text-[#655d5a]">{isEditing ? "저장할 말투와 기억을 직접 다듬고 있습니다." : "기억을 확인하고 수정하세요."}</p>
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
                        <div
                            ref={detailContentScrollRef}
                            className="flex-1 overflow-y-auto overscroll-contain p-8 lg:p-12 scrollbar-hide"
                            style={
                                isEditing && isEditInputFocused
                                    ? {
                                        paddingBottom: isNativeAppRuntime
                                            ? "calc(max(var(--bogopa-keyboard-height, 0px), 320px) + env(safe-area-inset-bottom) + 8rem)"
                                            : "calc(var(--bogopa-keyboard-height, 0px) + env(safe-area-inset-bottom) + 6rem)",
                                        scrollPaddingBottom: isNativeAppRuntime
                                            ? "calc(max(var(--bogopa-keyboard-height, 0px), 320px) + env(safe-area-inset-bottom) + 4rem)"
                                            : "calc(var(--bogopa-keyboard-height, 0px) + env(safe-area-inset-bottom) + 3rem)",
                                    }
                                    : undefined
                            }
                        >
                            <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
                                {/* Left Section: Core Vibe & Settings */}
                                <div className="space-y-12">
                                    <section>
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">기초 정체성</h3>
                                        <div className="grid grid-cols-1 gap-4 rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
                                            <div className="space-y-3">
                                                <label className="text-sm font-extrabold text-[#655d5a] uppercase block">기억 사진</label>
                                                <div className="mx-auto w-full max-w-[240px]">
                                                    <div className="relative aspect-square overflow-hidden rounded-[1.6rem] border border-[#4a626d]/20 bg-[#f4f4ef]">
                                                        {detailAvatarSrc ? (
                                                            <img src={detailAvatarSrc} alt={`${selectedPersona.name} 사진`} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-[#4a626d]">
                                                                <svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {isEditing ? (
                                                        <div className="mt-3 space-y-2">
                                                            <input
                                                                ref={avatarFileInputRef}
                                                                type="file"
                                                                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                                                                className="hidden"
                                                                onChange={handleAvatarFileChange}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => avatarFileInputRef.current?.click()}
                                                                disabled={isAvatarUploading || isSaving}
                                                                className="w-full rounded-2xl border border-[#4a626d]/35 bg-[#f4f4ef] px-4 py-3 text-sm font-bold text-[#4a626d] hover:bg-[#eceee8] disabled:cursor-not-allowed disabled:opacity-60"
                                                            >
                                                                {isAvatarUploading ? "사진 업로드 중..." : "사진 바꾸기"}
                                                            </button>
                                                            {avatarUploadError ? (
                                                                <p className="text-xs font-medium text-[#9f403d]">{avatarUploadError}</p>
                                                            ) : (
                                                                <p className="text-xs text-[#7b827d]">정사각형 비율의 이미지를 권장해요.</p>
                                                            )}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
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
                                                    <CustomDropdown label="대화 텐션" options={DROPDOWN_OPTIONS.politeness} value={editForm.politeness} onChange={(v) => setEditForm({ ...editForm, politeness: v })} />
                                                    <CustomDropdown label="공감 방식" options={DROPDOWN_OPTIONS.empathyStyle} value={editForm.empathyStyle} onChange={(v) => setEditForm({ ...editForm, empathyStyle: v })} />
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                                    {[
                                                        (() => {
                                                            const resolvedGoal = resolveGoalSelection({
                                                                runtimeGoal: selectedPersona.runtime?.goal,
                                                                analysisGoal: selectedPersona.analysis?.conversationIntent?.primaryGoal,
                                                                runtimeCustomGoalText: selectedPersona.runtime?.customGoalText,
                                                                analysisCustomGoalText: selectedPersona.analysis?.conversationIntent?.customGoalText,
                                                            });
                                                            return {
                                                                label: '대화 목적',
                                                                val:
                                                                    resolvedGoal.goal === "custom"
                                                                        ? (resolvedGoal.customGoalText || GOAL_VALUE_TO_LABEL.custom)
                                                                        : toGoalLabel(resolvedGoal.goal),
                                                            };
                                                        })(),
                                                        { label: '대화 텐션', val: normalizeConversationTension(selectedPersona.runtime?.style?.politeness || "") },
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
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">소중한 기억의 조각들</h3>
                                        <div className="min-h-[168px] rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
                                            {isEditing ? (
                                                renderListEditor(
                                                    "핵심 기억",
                                                    editForm.memories,
                                                    (next) => setEditForm({ ...editForm, memories: next }),
                                                    "예: 2019년 제주도 바닷가 산책",
                                                    {
                                                        maxItems: limits.memoryItemMaxCount,
                                                        maxChars: MEMORY_ITEM_CHAR_LIMIT,
                                                        onLimitReached: isSubscribed ? undefined : goToPayment,
                                                    },
                                                )
                                            ) : (
                                                <div className="min-h-[104px] space-y-4">
                                                    {(selectedPersona.runtime?.memories || []).length > 0 ? (
                                                        <div className="flex flex-wrap gap-3">
                                                            {(selectedPersona.runtime?.memories || []).map((memory, i) => (
                                                                <span key={i} className="rounded-2xl bg-[#f4f4ef] px-4 py-2.5 text-base font-bold text-[#4a626d] border border-[#4a626d]/45 shadow-sm">
                                                                    "{memory}"
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-[#5d605a] italic">아직 공유된 기억이 없습니다.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">입버릇처럼 달고 살던 말</h3>
                                        <div className="min-h-[168px] rounded-[2rem] bg-white p-6 md:p-8 shadow-sm border border-[#afb3ac]/10">
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
                                                <div className="min-h-[104px]">
                                                    {(selectedPersona.runtime?.expressions?.frequentPhrases || []).length > 0 ? (
                                                        <div className="flex flex-wrap gap-3">
                                                            {(selectedPersona.runtime?.expressions?.frequentPhrases || []).map((phrase, i) => (
                                                                <span key={i} className="rounded-2xl bg-[#f4f4ef] px-4 py-2.5 text-base font-bold text-[#4a626d] border border-[#4a626d]/45 shadow-sm">
                                                                    "{phrase}"
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-[#5d605a] italic">아직 공유된 입버릇이 없습니다.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        {!(isEditing && isEditInputFocused) ? (
                        <footer className="shrink-0 border-t border-white/10 bg-[#303733]/96 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:flex lg:min-h-[calc(5.5rem+env(safe-area-inset-bottom))] lg:items-center lg:justify-between lg:border-[#afb3ac]/10 lg:bg-white lg:px-12 lg:py-6 lg:backdrop-blur-0">
                            <div className="ml-auto flex w-full justify-end gap-3 pb-safe md:w-auto">
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
                                    <div className="grid w-full grid-cols-2 gap-2 pb-safe md:gap-4">
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setEditAvatarUrl(selectedPersona.avatar_url || null);
                                                setAvatarUploadError("");
                                                setIsAvatarUploading(false);
                                            }}
                                            className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-[#4a626d] bg-white px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#cde6f4]/25 active:scale-[0.98] md:rounded-2xl md:text-lg md:font-bold md:shadow-none"
                                        >
                                            취소
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving || isAvatarUploading || !hasPendingChanges}
                                            className="group w-full flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:rounded-2xl md:text-lg md:font-bold md:shadow-lg"
                                        >
                                            {isSaving ? (
                                                <div className="h-4 w-4 animate-spin rounded-full border-3 border-white border-t-transparent" />
                                            ) : "저장하기"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </footer>
                        ) : null}
                    </div>
                </div>
            )}

            <MemoryPassExpiredLockOverlay
                open={Boolean(lockedPersonaName)}
                onClose={() => setLockedPersonaName("")}
                returnTo="/persona"
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
