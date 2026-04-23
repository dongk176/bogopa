export const CONVERSATION_TENSION_OPTIONS = [
  "토닥토닥 심야감성",
  "소소한 일상",
  "도파민 풀충전",
  "티키타카 핑퐁",
] as const;

type ConversationTension = (typeof CONVERSATION_TENSION_OPTIONS)[number];
const PARTNER_ONLY_TENSION_OPTIONS = new Set<ConversationTension>(["도파민 풀충전", "티키타카 핑퐁"]);

const CONVERSATION_TENSION_DESCRIPTION: Record<ConversationTension, string> = {
  "도파민 풀충전": "오디오 빌 틈 없는 하이텐션! 드립과 리액션이 난무하는 신나는 대화",
  "티키타카 핑퐁": "쉴 새 없이 주고받는 찰진 티키타카와 가벼운 장난",
  "소소한 일상": "과하지 않고 편안하게, 물 흐르듯 이어지는 일상적인 수다",
  "토닥토닥 심야감성": "차분하고 몽글몽글하게, 마음을 깊게 안아주는 힐링 대화",
};

const LEGACY_POLITENESS_TO_TENSION: Record<string, ConversationTension> = {
  "편안한 반말": "소소한 일상",
  "정중한 존댓말": "소소한 일상",
  "반말+존댓말 혼용": "티키타카 핑퐁",
  "다정하지만 깍듯함": "토닥토닥 심야감성",
  "존댓말 중심": "소소한 일상",
};

const DEFAULT_TENSION: ConversationTension = "소소한 일상";

function isConversationTension(value: string): value is ConversationTension {
  return (CONVERSATION_TENSION_OPTIONS as readonly string[]).includes(value);
}

export function normalizeConversationTension(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return DEFAULT_TENSION;
  if (isConversationTension(raw)) return raw;
  return LEGACY_POLITENESS_TO_TENSION[raw] || DEFAULT_TENSION;
}

export function isPartnerRelation(relation?: string) {
  const normalized = (relation || "").trim().replace(/\s+/g, "").toLowerCase();
  if (!normalized) return false;
  if (normalized === "partner") return true;
  if (normalized === "연인" || normalized === "배우자" || normalized === "연인/배우자") return true;
  return normalized.includes("연인") || normalized.includes("배우자");
}

export function getConversationTensionOptionsByRelation(relation?: string) {
  if (isPartnerRelation(relation)) {
    return [...CONVERSATION_TENSION_OPTIONS];
  }
  return CONVERSATION_TENSION_OPTIONS.filter((option) => !PARTNER_ONLY_TENSION_OPTIONS.has(option));
}

export function normalizeConversationTensionByRelation(value?: string, relation?: string) {
  const normalized = normalizeConversationTension(value);
  if (isPartnerRelation(relation)) return normalized;
  if (PARTNER_ONLY_TENSION_OPTIONS.has(normalized)) return DEFAULT_TENSION;
  return normalized;
}

export function getConversationTensionDescription(value?: string) {
  const normalized = normalizeConversationTension(value);
  return CONVERSATION_TENSION_DESCRIPTION[normalized];
}

export function getConversationTensionGuide(value?: string) {
  const normalized = normalizeConversationTension(value);
  return `${normalized}: ${CONVERSATION_TENSION_DESCRIPTION[normalized]}`;
}
