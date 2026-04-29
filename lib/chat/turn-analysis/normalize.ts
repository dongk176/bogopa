import {
  UNFINISHED_POINT_MAX_LENGTH,
  FALLBACK_TURN_ANALYSIS,
  EMOTION_MAX_LENGTH,
  HUMAN_REACTION_STYLE_VALUES,
  INTENT_MAX_LENGTH,
  REASON_MAX_LENGTH,
  TEXT_QUALITY_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  TOPIC_SHIFT_VALUES,
} from "./constants";
import type {
  HumanReactionStyle,
  TopicShift,
  TurnAnalysis,
  TurnAnalysisValidationIssue,
} from "./types";

const WRAPPER_PATTERN = /^["'“”‘’`\[\](){}<>]+|["'“”‘’`\[\](){}<>.,!?~…]+$/g;
const MULTI_SPACE_PATTERN = /\s+/g;
const CANONICAL_NOISE_PATTERN = /[\s"'“”‘’`.,!?~…()[\]{}<>]+/g;
const GENERIC_TOPIC_PREFIXES = [
  "일상 대화",
  "감정 표현",
  "현재 상태",
  "상황",
  "생각",
  "대화",
  "가족 대화",
  "연인 대화",
];
const MODE_INTENT_RESTATEMENT_PATTERNS: Record<HumanReactionStyle, string[]> = {
  casually_receive: ["가볍게 받아주기", "가볍게 반응하기"],
  continue_the_mood: ["분위기 이어가기", "텐션 이어가기", "분위기 유지"],
  show_small_care: ["생활감 있는 챙김", "챙겨주기"],
  make_room_to_talk: ["여지를 남기기", "더 말하게 하기"],
  stay_close_quietly: ["조용히 곁에 있기", "가만히 있어주기"],
  take_user_side_plainly: ["내 편 들어주기", "편들어주기", "같이 화내주기"],
  recognize_effort: ["애쓴 것 알아봐주기", "수고 알아봐주기", "인정해주기"],
  give_one_realistic_word: ["현실적인 한마디 주기", "한마디 조언하기", "작은 다음 단계 주기"],
  ask_like_curious_person: ["자연스럽게 물어보기", "질문 던지기", "궁금한 척 질문하기"],
  playfully_push_and_pull: ["장난치기", "밀고 당기기"],
  receive_affection_warmly: ["따뜻하게 받아주기", "애정 받아주기"],
  miss_together: ["같이 그리워하기", "같이 보고 싶어하기"],
  bring_up_memory_piece: ["추억 꺼내기", "기억 한 조각 꺼내기"],
  check_unclear_message: ["다시 확인하기", "뜻 확인하기"],
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = typeof value === "string" ? value.trim() : "";
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
}

function cleanInlineText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(MULTI_SPACE_PATTERN, " ")
    .replace(WRAPPER_PATTERN, "")
    .trim();
}

function truncateAtBoundary(value: string, max: number) {
  if (value.length <= max) return value;
  const slice = value.slice(0, max).trim();
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= Math.floor(max * 0.45)) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice;
}

function normalizeRequiredLabel(value: unknown, max: number, fallback: string) {
  const cleaned = cleanInlineText(value);
  if (!cleaned) return fallback;
  const truncated = truncateAtBoundary(cleaned, max);
  return truncated || fallback;
}

function normalizeNullableLabel(value: unknown, max: number) {
  const cleaned = cleanInlineText(value);
  if (!cleaned) return null;
  const truncated = truncateAtBoundary(cleaned, max);
  return truncated || null;
}

function normalizeNullableObjectField(
  value: unknown,
  max: number,
): { value: string | null; invalid: boolean } {
  if (value == null) return { value: null, invalid: false };
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const status = cleanInlineText(source.status);
    if (status === "none") return { value: null, invalid: false };
    if (status === "present") {
      return {
        value: normalizeNullableLabel(source.value, max),
        invalid: false,
      };
    }
    return { value: null, invalid: true };
  }

  return { value: null, invalid: true };
}

function normalizeTopic(value: unknown) {
  return normalizeNullableLabel(value, TOPIC_MAX_LENGTH);
}

function normalizeReason(value: unknown) {
  const cleaned = cleanInlineText(value);
  if (!cleaned) return FALLBACK_TURN_ANALYSIS.reason;
  const firstLine = cleaned.split(/(?<=[.!?])\s+|\s*\n+/)[0] || cleaned;
  const truncated = truncateAtBoundary(firstLine, REASON_MAX_LENGTH);
  return truncated || FALLBACK_TURN_ANALYSIS.reason;
}

function canonicalizeForComparison(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(CANONICAL_NOISE_PATTERN, "")
    .trim()
    .toLowerCase();
}

function overlapsMeaning(a: string | null, b: string | null) {
  const left = canonicalizeForComparison(a);
  const right = canonicalizeForComparison(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 5 && right.includes(left)) return true;
  if (right.length >= 5 && left.includes(right)) return true;
  return false;
}

function isGenericTopic(value: string | null) {
  if (!value) return false;
  const cleaned = cleanInlineText(value);
  return GENERIC_TOPIC_PREFIXES.some(
    (prefix) => cleaned === prefix || cleaned.startsWith(`${prefix} `) || cleaned.startsWith(`${prefix},`),
  );
}

function isIntentModeOverlap(primaryIntent: string, desiredResponseMode: HumanReactionStyle) {
  const intent = canonicalizeForComparison(primaryIntent);
  if (!intent) return false;
  const patterns = MODE_INTENT_RESTATEMENT_PATTERNS[desiredResponseMode] || [];
  return patterns.some((pattern) => {
    const candidate = canonicalizeForComparison(pattern);
    return candidate.length > 0 && (intent === candidate || intent.includes(candidate) || candidate.includes(intent));
  });
}

function validateTurnAnalysis(input: {
  topic: string | null;
  unfinishedPoint: { value: string | null; invalid: boolean };
  primaryIntent: string;
  desiredResponseMode: HumanReactionStyle;
  currentUserMessageContent: string;
}): TurnAnalysisValidationIssue[] {
  const issues: TurnAnalysisValidationIssue[] = [];

  if (isGenericTopic(input.topic)) {
    issues.push({
      code: "topic_too_generic",
      detail: input.topic || undefined,
    });
  }

  if (input.unfinishedPoint.invalid) {
    issues.push({ code: "unfinished_point_contract_invalid" });
  }

  if (
    input.unfinishedPoint.value &&
    (overlapsMeaning(input.unfinishedPoint.value, input.currentUserMessageContent) ||
      overlapsMeaning(input.unfinishedPoint.value, input.topic) ||
      overlapsMeaning(input.unfinishedPoint.value, input.primaryIntent))
  ) {
    issues.push({
      code: "unfinished_point_restatement",
      detail: input.unfinishedPoint.value,
    });
  }

  if (isIntentModeOverlap(input.primaryIntent, input.desiredResponseMode)) {
    issues.push({
      code: "intent_mode_overlap",
      detail: `${input.primaryIntent} :: ${input.desiredResponseMode}`,
    });
  }

  return issues;
}

export function buildFallbackTurnAnalysis(): TurnAnalysis {
  return { ...FALLBACK_TURN_ANALYSIS };
}

export function normalizeTurnAnalysis(raw: unknown, currentUserMessageContent: string): {
  analysis: TurnAnalysis;
  validationIssues: TurnAnalysisValidationIssue[];
} {
  const fallback = buildFallbackTurnAnalysis();
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const topic = normalizeTopic(source.topic);
  const primaryIntent = normalizeRequiredLabel(source.primaryIntent, INTENT_MAX_LENGTH, fallback.primaryIntent);
  const unfinishedPoint = normalizeNullableObjectField(source.unfinishedPoint, UNFINISHED_POINT_MAX_LENGTH);
  const desiredResponseMode = asEnumValue<HumanReactionStyle>(
    source.desiredResponseMode,
    HUMAN_REACTION_STYLE_VALUES,
    fallback.desiredResponseMode,
  );

  const validationIssues = validateTurnAnalysis({
    topic,
    unfinishedPoint,
    primaryIntent,
    desiredResponseMode,
    currentUserMessageContent,
  });

  const analysis: TurnAnalysis = {
    topic,
    topicShift: asEnumValue<TopicShift>(source.topicShift, TOPIC_SHIFT_VALUES, fallback.topicShift),
    primaryIntent,
    emotion: normalizeRequiredLabel(source.emotion, EMOTION_MAX_LENGTH, fallback.emotion),
    intensity: Math.round(clampNumber(source.intensity, 0, 5, fallback.intensity)),
    desiredResponseMode,
    unfinishedPoint: unfinishedPoint.value,
    textQuality: normalizeRequiredLabel(source.textQuality, TEXT_QUALITY_MAX_LENGTH, fallback.textQuality),
    reason: normalizeReason(source.reason),
  };

  return {
    analysis,
    validationIssues,
  };
}
