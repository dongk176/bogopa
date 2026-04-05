export const CONVERSATION_TENSION_OPTIONS = [
  "토닥토닥 심야감성",
  "소소한 일상",
  "도파민 풀충전",
  "티키타카 핑퐁",
] as const;

type ConversationTension = (typeof CONVERSATION_TENSION_OPTIONS)[number];

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

export function getConversationTensionDescription(value?: string) {
  const normalized = normalizeConversationTension(value);
  return CONVERSATION_TENSION_DESCRIPTION[normalized];
}

export function getConversationTensionGuide(value?: string) {
  const normalized = normalizeConversationTension(value);
  return `${normalized}: ${CONVERSATION_TENSION_DESCRIPTION[normalized]}`;
}
