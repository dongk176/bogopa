"use client";

import { useEffect, useRef, useState, type FocusEvent, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { PersonaRuntime, PrimaryGoal } from "@/types/persona";
import { FREE_PLAN_LIMITS, PlanLimits } from "@/lib/memory-pass/config";
import {
  CONVERSATION_TENSION_OPTIONS,
  normalizeConversationTension,
} from "@/lib/persona/conversationTension";

type Props = {
  open: boolean;
  runtime: PersonaRuntime | null;
  avatarUrl: string | null;
  onClose: () => void;
  onRuntimeSaved: (runtime: PersonaRuntime) => void;
};

type EditForm = {
  name: string;
  relation: string;
  callsUserAs: string;
  frequentPhrases: string[];
  tone: string;
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
};

const DROPDOWN_OPTIONS = {
  politeness: [...CONVERSATION_TENSION_OPTIONS],
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
const SHEET_CLOSE_SWIPE_THRESHOLD = 72;
const MEMORY_ITEM_CHAR_LIMIT = 50;

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

function toGoalLabel(value?: string) {
  if (!value) return GOAL_VALUE_TO_LABEL.casual_talk;
  return GOAL_VALUE_TO_LABEL[value as PrimaryGoal] || GOAL_VALUE_TO_LABEL.casual_talk;
}

function toGoalValue(label?: string): PrimaryGoal {
  const entry = Object.entries(GOAL_VALUE_TO_LABEL).find(([, text]) => text === label);
  if (!entry) return "casual_talk";
  return entry[0] as PrimaryGoal;
}

function CustomDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
}) {
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
      <label className="mb-2 block text-sm font-bold uppercase text-[#7b827d]">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#242926] px-5 py-4 text-base font-bold text-[#f0f5f2] transition-all hover:bg-[#2d3430] active:scale-[0.98]"
      >
        <span>{value}</span>
        <svg className={`h-4 w-4 text-[#b8c3be] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="animate-fade-in absolute left-0 top-full z-[120] mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#1f2421] shadow-xl">
          {options.map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
              className={`flex w-full items-center px-5 py-4 text-left text-base font-bold transition-colors ${
                value === opt ? "bg-[#4a626d] text-[#f0f9ff]" : "text-[#e6ece8] hover:bg-[#323a36]"
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

function buildInitialEditForm(runtime: PersonaRuntime): EditForm {
  return {
    name: runtime.displayName || "",
    relation: runtime.relation || "",
    callsUserAs: runtime.addressing?.callsUserAs?.[0] || "나",
    frequentPhrases: runtime.expressions?.frequentPhrases || [],
    tone: (runtime.style?.tone || []).join(", "),
    politeness: normalizeConversationTension(runtime.style?.politeness || ""),
    sentenceLength: runtime.style?.sentenceLength || "적당한 길이",
    replyTempo: runtime.style?.replyTempo || "적당한 템포",
    empathyStyle: runtime.behavior?.empathyFirst === false ? "차분한 이성적 위로" : "감성 공감 우선",
    goal: toGoalLabel(runtime.goal),
    customGoalText: (runtime.customGoalText || "").trim(),
    laughterPatterns: runtime.expressions?.laughterPatterns || [],
    sadnessPatterns: runtime.expressions?.sadnessPatterns || [],
    memories: runtime.memories || [],
    avoidTopics: runtime.topics?.avoid || [],
  };
}

export default function PersonaMemorySheet({ open, runtime, avatarUrl, onClose, onRuntimeSaved }: Props) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isEditInputFocused, setIsEditInputFocused] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [limits, setLimits] = useState<PlanLimits>(FREE_PLAN_LIMITS);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isHandleDragging, setIsHandleDragging] = useState(false);
  const sheetSwipeStartYRef = useRef<number | null>(null);
  const sheetSwipeLastYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !runtime) return;
    setEditForm(buildInitialEditForm(runtime));
    setIsEditing(false);
    setIsEditInputFocused(false);

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
  }, [open, runtime]);

  useEffect(() => {
    if (!open) {
      document.body.classList.remove("modal-open");
      setIsEditInputFocused(false);
      setIsHandleDragging(false);
      sheetSwipeStartYRef.current = null;
      sheetSwipeLastYRef.current = null;
      return;
    }
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [open]);

  useEffect(() => {
    if (!isEditing) {
      setIsEditInputFocused(false);
    }
  }, [isEditing]);

  function handleSheetSwipeStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    sheetSwipeStartYRef.current = y;
    sheetSwipeLastYRef.current = y;
    setIsHandleDragging(true);
  }

  function handleSheetSwipeMove(event: TouchEvent<HTMLDivElement>) {
    if (!isHandleDragging || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    sheetSwipeLastYRef.current = y;
    if (y > (sheetSwipeStartYRef.current ?? y)) {
      event.preventDefault();
    }
  }

  function handleSheetSwipeEnd() {
    const startY = sheetSwipeStartYRef.current;
    const endY = sheetSwipeLastYRef.current;
    const deltaY = startY !== null && endY !== null ? endY - startY : 0;

    setIsHandleDragging(false);
    sheetSwipeStartYRef.current = null;
    sheetSwipeLastYRef.current = null;

    if (deltaY > SHEET_CLOSE_SWIPE_THRESHOLD) {
      onClose();
    }
  }

  function handleEditorFocusCapture(event: FocusEvent<HTMLDivElement>) {
    if (!isEditing) return;
    if (isEditableTarget(event.target)) {
      setIsEditInputFocused(true);
    }
  }

  function handleEditorBlurCapture(event: FocusEvent<HTMLDivElement>) {
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

  const renderListEditor = (
    label: string,
    list: string[],
    setList: (next: string[]) => void,
    placeholder = "내용을 입력하세요",
    options?: { maxItems?: number; maxChars?: number; onLimitReached?: () => void },
  ) => (
    <div className="space-y-3">
      <label className="mb-1 block text-sm font-bold uppercase text-[#4a626d]">{label}</label>
      {list.map((item, idx) => (
        <div key={`${label}-${idx}`} className="flex gap-2">
          <input
            type="text"
            value={item}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...list];
              next[idx] = e.target.value.slice(0, options?.maxChars ?? 120);
              setList(next);
            }}
            className="flex-1 rounded-xl border border-[#afb3ac]/45 bg-[#f4f4ef] px-4 py-3 text-base font-bold text-[#2f342e] placeholder:text-[#7f867f] transition-all focus:outline-none focus:border-2 focus:border-[#4a626d] focus:ring-0"
          />
          <button
            type="button"
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
        className="w-full rounded-xl border border-dashed border-[#4a626d]/40 py-3.5 text-sm font-bold text-[#4a626d] transition-all hover:border-[#3e5560] hover:text-[#3e5560]"
      >
        + 항목 추가하기
      </button>
      <p className="text-xs text-[#5d605a]">
        최대 {options?.maxItems ?? 20}개 · 항목당 최대 {options?.maxChars ?? 120}자
      </p>
    </div>
  );

  const goToPayment = () => {
    router.push(`/payment?returnTo=${encodeURIComponent("/chat")}`);
  };

  async function handleSave() {
    if (!runtime || !editForm) return;
    setIsSaving(true);
    try {
        const updatedRuntime: PersonaRuntime = {
          ...runtime,
          displayName: editForm.name,
          relation: editForm.relation,
          goal: toGoalValue(editForm.goal),
          customGoalText: toGoalValue(editForm.goal) === "custom" ? (editForm.customGoalText || "").trim() : "",
          summary: "",
          addressing: {
            ...(runtime.addressing || { callsUserAs: [], userCallsPersonaAs: [] }),
            callsUserAs: [editForm.callsUserAs],
          },
        expressions: {
          ...(runtime.expressions || { frequentPhrases: [], emojiExamples: [], laughterPatterns: [], sadnessPatterns: [], typoExamples: [] }),
          frequentPhrases: editForm.frequentPhrases,
          laughterPatterns: editForm.laughterPatterns,
          sadnessPatterns: editForm.sadnessPatterns,
        },
        style: {
          ...(runtime.style || { tone: [], politeness: "", sentenceLength: "", replyTempo: "", humorStyle: "" }),
          tone: editForm.tone
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          politeness: normalizeConversationTension(editForm.politeness),
          sentenceLength: editForm.sentenceLength,
          replyTempo: editForm.replyTempo,
        },
        behavior: {
          ...(runtime.behavior || { empathyFirst: true, feedbackStyle: "", preferredReplyLength: "", conflictStyle: "" }),
          empathyFirst: editForm.empathyStyle === "감성 공감 우선",
        },
        memories: editForm.memories,
        topics: {
          ...(runtime.topics || { frequent: [], avoid: [] }),
          avoid: editForm.avoidTopics,
        },
      };

      const res = await fetch("/api/persona", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: runtime.personaId,
          name: editForm.name,
          avatarUrl,
          runtime: updatedRuntime,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
      if (res.status === 402 || res.status === 403 || data?.code === "PREMIUM_REQUIRED") {
        goToPayment();
        return;
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "저장 실패");
      }

      onRuntimeSaved(updatedRuntime);
      setIsEditing(false);
    } catch (err) {
      console.error("[persona-sheet] failed to save", err);
    } finally {
      setIsSaving(false);
    }
  }

  if (!open || !runtime || !editForm) return null;

  const resolvedAvatar =
    avatarUrl && avatarUrl.includes("amazonaws.com")
      ? `/api/image-proxy?url=${encodeURIComponent(avatarUrl)}`
      : avatarUrl;

  return (
    <div className="animate-fade-in fixed inset-0 z-[140] flex items-end justify-center bg-black/40 backdrop-blur-sm lg:items-center lg:p-5">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="animate-slide-up relative flex h-[90vh] w-full flex-col overflow-hidden rounded-t-[3rem] border border-white/20 bg-[#faf9f5] shadow-2xl lg:max-w-5xl lg:rounded-[3rem]"
        onFocusCapture={handleEditorFocusCapture}
        onBlurCapture={handleEditorBlurCapture}
      >
        <div
          className="mx-auto mt-3 flex w-full shrink-0 touch-none justify-center pb-2 lg:hidden"
          onTouchStart={handleSheetSwipeStart}
          onTouchMove={handleSheetSwipeMove}
          onTouchEnd={handleSheetSwipeEnd}
          onTouchCancel={handleSheetSwipeEnd}
        >
          <div
            className={`h-1.5 rounded-full transition-all ${
              isHandleDragging ? "w-16 bg-[#8a928d]/55" : "w-12 bg-[#afb3ac]/30"
            }`}
          />
        </div>

        <header className="flex shrink-0 items-center justify-between border-b border-[#afb3ac]/10 bg-[#faf9f5] px-8 py-6 lg:px-12">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#4a626d]/10">
              {resolvedAvatar ? (
                <img src={resolvedAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#4a626d]">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-headline text-xl font-bold text-[#2f342e]">{runtime.displayName}와의 기억</h2>
              <p className="text-xs text-[#655d5a]">{isEditing ? "저장할 말투와 기억을 직접 다듬고 있습니다." : "저장한 대화 스타일과 기억을 확인하거나 수정하세요."}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="hidden rounded-3xl bg-[#655d5a] px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#655d5a]/20 transition-all hover:bg-[#524b49] active:scale-95 lg:block"
              >
                수정하기
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="rounded-full bg-[#f4f4ef] p-2 text-[#655d5a] transition-transform duration-200 hover:bg-[#9f403d]/10 hover:text-[#9f403d] active:scale-90">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="scrollbar-hide flex-1 overflow-y-auto p-8 lg:p-12">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            <div className="space-y-12">
              <section>
                <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">기초 정체성</h3>
                <div className="grid grid-cols-1 gap-4 rounded-[2rem] border border-[#afb3ac]/10 bg-white p-6 shadow-sm md:p-8">
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="mb-1 block text-sm font-extrabold uppercase text-[#655d5a]">표시 이름</label>
                        {isEditing ? (
                          <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full rounded-2xl bg-[#f4f4ef] px-4 py-3 text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[#4a626d]/20" />
                        ) : (
                          <p className="text-2xl font-bold text-[#2f342e]">{runtime.displayName}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="mb-1 block text-sm font-extrabold uppercase text-[#655d5a]">나를 부르는 호칭</label>
                        {isEditing ? (
                          <input type="text" value={editForm.callsUserAs} onChange={(e) => setEditForm({ ...editForm, callsUserAs: e.target.value })} className="w-full rounded-2xl bg-[#f4f4ef] px-4 py-3 text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[#4a626d]/20" />
                        ) : (
                          <p className="text-xl font-bold text-[#2f342e]">{runtime.addressing?.callsUserAs?.[0] || "나"}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">대화 스타일</h3>
                <div className="grid grid-cols-1 gap-6 rounded-[2rem] border border-[#afb3ac]/10 bg-white p-6 shadow-sm md:p-8">
                  {isEditing ? (
                    <div className="grid grid-cols-1 gap-6">
                      <CustomDropdown label="대화 목적" options={GOAL_LABELS} value={editForm.goal} onChange={(v) => setEditForm({ ...editForm, goal: v })} />
                      {editForm.goal === GOAL_VALUE_TO_LABEL.custom ? (
                        <div className="space-y-2">
                          <label className="block text-sm font-bold uppercase text-[#7b827d]">직접 입력 내용</label>
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
                        {
                          label: "대화 목적",
                          val:
                            runtime.goal === "custom"
                              ? runtime.customGoalText || "직접 입력"
                              : toGoalLabel(runtime.goal),
                        },
                        { label: "대화 텐션", val: normalizeConversationTension(runtime.style?.politeness || "") },
                        { label: "공감 방식", val: runtime.behavior?.empathyFirst ? "감성 공감 우선" : "차분한 이성적 위로" },
                      ].map((item) => (
                        <div key={item.label} className="space-y-1">
                          <span className="block text-sm font-extrabold uppercase text-[#655d5a]">{item.label}</span>
                          <p className="text-xl font-bold text-[#2f342e]">{item.val || "미지정"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">디지털 대화 습관</h3>
                <div className="space-y-6 rounded-[2rem] border border-[#afb3ac]/10 bg-white p-6 shadow-sm md:p-8">
                  {isEditing ? (
                    <>
                      {renderListEditor("웃음 습관 (ㅋㅋ, ㅎㅎ 등)", editForm.laughterPatterns, (next) => setEditForm({ ...editForm, laughterPatterns: next }), "내용을 입력하세요", {
                        maxItems: 20,
                        maxChars: 30,
                      })}
                      {renderListEditor("슬픔 습관 (ㅠㅠ, ... 등)", editForm.sadnessPatterns, (next) => setEditForm({ ...editForm, sadnessPatterns: next }), "내용을 입력하세요", {
                        maxItems: 20,
                        maxChars: 30,
                      })}
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="mb-2 block text-sm font-extrabold uppercase text-[#655d5a]">웃음 패턴</label>
                        <div className="flex flex-wrap gap-2 text-base font-bold text-[#2f342e]">
                          {(runtime.expressions?.laughterPatterns || []).join(", ") || "내역 없음"}
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-extrabold uppercase text-[#655d5a]">슬픔 패턴</label>
                        <div className="flex flex-wrap gap-2 text-base font-bold text-[#2f342e]">
                          {(runtime.expressions?.sadnessPatterns || []).join(", ") || "내역 없음"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-12">
              <section>
                <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">소중한 기억의 조각들</h3>
                <div className="min-h-[168px] rounded-[2rem] border border-[#afb3ac]/10 bg-white p-6 shadow-sm md:p-8">
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
                      {(runtime.memories || []).length > 0 ? (
                        (runtime.memories || []).map((memory, i) => (
                          <div key={i} className="flex items-start gap-4 border-b border-[#afb3ac]/20 py-5 last:border-0">
                            <svg className="mt-1 h-5 w-5 shrink-0 text-[#4a626d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.456-2.455l.259-1.036.259 1.036a3.375 3.375 0 002.455 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                            </svg>
                            <p className="text-base font-medium leading-relaxed text-[#2f342e]">{memory}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm italic text-[#5d605a]">아직 공유된 기억이 없습니다.</p>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-[#4a626d]">입버릇처럼 달고 살던 말</h3>
                <div className="min-h-[168px] rounded-[2rem] border border-[#afb3ac]/10 bg-white p-6 shadow-sm md:p-8">
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
                      {(runtime.expressions?.frequentPhrases || []).length > 0 ? (
                        <div className="flex flex-wrap gap-3">
                          {(runtime.expressions?.frequentPhrases || []).map((phrase, i) => (
                            <span key={i} className="rounded-2xl border border-[#4a626d]/5 bg-[#f4f4ef] px-4 py-2.5 text-base font-bold text-[#4a626d] shadow-sm">
                              "{phrase}"
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm italic text-[#5d605a]">아직 공유된 입버릇이 없습니다.</p>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-[#afb3ac]/10 bg-white p-6 lg:px-12">
          <div className="ml-auto flex w-full justify-end gap-3 pb-safe md:w-auto">
            {!isEditing ? (
              <div className="grid w-full grid-cols-2 gap-3 pb-safe md:flex md:w-auto md:justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-3xl bg-[#655d5a] px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-[#655d5a]/20 transition-all active:scale-95 md:hidden"
                >
                  수정하기
                </button>
                <button type="button" onClick={onClose} className="w-full rounded-3xl bg-[#4a626d] px-10 py-4 text-center text-sm font-extrabold text-white shadow-xl shadow-[#4a626d]/20 transition-all hover:scale-[1.02] hover:shadow-2xl active:scale-95 md:w-auto">
                  대화 계속하기
                </button>
              </div>
            ) : isEditInputFocused ? null : (
              <div className="grid w-full grid-cols-2 gap-3 pb-safe md:flex md:w-auto md:justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-2xl bg-[#f4f4ef] px-6 py-4 text-sm font-bold text-[#655d5a] transition-colors md:py-3"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-[#4a626d] px-6 py-4 text-sm font-extrabold text-white shadow-xl shadow-[#4a626d]/30 transition-all disabled:opacity-50 md:py-3"
                >
                  {isSaving ? <div className="h-4 w-4 animate-spin rounded-full border-3 border-white border-t-transparent" /> : "저장하기"}
                </button>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
