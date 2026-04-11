import { NextRequest, NextResponse } from "next/server";
import {
  createOpenAIClient,
  hasOpenAIKey,
  OPENAI_REPLY_MODEL,
  OPENAI_LABEL_MODEL,
  OPENAI_EMBEDDING_MODEL,
} from "@/lib/ai/createOpenAIClient";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrCreateSession, saveMessageToDb, saveAssistantGreetingToDb, insertChatMemoryVector } from "@/lib/server/chat-db";
import { PersonaRuntime } from "@/types/persona";
import { MEMORY_COSTS } from "@/lib/memory-pass/config";
import { consumeMemory, getOrCreateMemoryPassStatus, hasActiveUnlimitedChat } from "@/lib/server/memory-pass";
import {
  getConversationTensionGuide,
  normalizeConversationTension,
} from "@/lib/persona/conversationTension";
import { logAnalyticsEventSafe } from "@/lib/server/analytics";
import { getPersonaLockStatus } from "@/lib/server/persona-lock";
import { getUserAiDataConsent } from "@/lib/server/user-profile";
import { AI_DATA_TRANSFER_PROVIDER_NAME } from "@/lib/ai-consent";

export const runtime = "nodejs";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type ChatAction = "reply" | "first_greeting";

type ChatRequestBody = {
  action?: ChatAction;
  runtime?: PersonaRuntime;
  messages?: ChatTurn[];
  alias?: string;
  styleSummary?: string;
};

const BASE_ASSISTANT_CHAR_MAX = 250;
const EXTENDED_ASSISTANT_CHAR_MAX = 300;
const MEMORY_RETRIEVAL_MIN_SIMILARITY = 0.6;
const MEMORY_RETRIEVAL_MIN_CONFIDENCE = 0.72;
const MEMORY_RETRIEVAL_CANDIDATE_LIMIT = 8;
const MEMORY_RETRIEVAL_PROMPT_LIMIT = 5;
const MEMORY_RETRIEVAL_WEIGHT_SIMILARITY = 0.65;
const MEMORY_RETRIEVAL_WEIGHT_RECENCY = 0.15;
const MEMORY_RETRIEVAL_WEIGHT_TOPIC = 0.1;
const MEMORY_RETRIEVAL_WEIGHT_EMOTION = 0.05;
const MEMORY_RETRIEVAL_WEIGHT_ENTITIES = 0.05;

const USER_EMOTIONS = ["기쁨", "슬픔", "불안", "피곤", "분노", "평온", "흥분"] as const;
const USER_INTENTS = ["하소연", "정보요구", "자랑", "일상공유", "조언구함"] as const;
const TOPIC_CATEGORIES = ["업무/프로젝트", "인간관계", "취미/여가", "건강", "일상"] as const;
const AI_ACTIONS = ["공감/위로", "해결책제시", "티키타카(장난)", "정보제공", "단호한조언"] as const;

type UserEmotion = (typeof USER_EMOTIONS)[number];
type UserIntent = (typeof USER_INTENTS)[number];
type TopicCategory = (typeof TOPIC_CATEGORIES)[number];
type AiAction = (typeof AI_ACTIONS)[number];

type UserMetaLabels = {
  userEmotion: UserEmotion;
  userIntent: UserIntent;
  topicCategory: TopicCategory;
  entities: string[];
  aiAction: AiAction;
  hasPromise: boolean;
  isUnresolved: boolean;
};

type QueryMetaLabels = {
  userEmotion: UserEmotion;
  topicCategory: TopicCategory;
  entities: string[];
};

type ChatDebugCandidate = {
  id: string;
  similarity: number;
  recency: number;
  topicMatch: number;
  emotionMatch: number;
  entityOverlap: number;
  score: number;
  createdAt: string;
  userEmotion: string | null;
  userIntent: string | null;
  topicCategory: string | null;
  entities: string[];
  aiAction: string | null;
  pairText: string;
};

type ChatDebugPayload = {
  retrieval: {
    queryText: string;
    queryMeta: QueryMetaLabels;
    isReferentialMessage: boolean;
    topSimilarity: number;
    thresholdSimilarity: number;
    thresholdConfidence: number;
    candidates: ChatDebugCandidate[];
    selected: ChatDebugCandidate[];
    error?: string;
  };
  prompt: {
    model: string;
    maxCompletionTokens: number;
    systemPrompt: string;
    history: ChatTurn[];
    retryTriggered: boolean;
    retrySystemPrompt?: string;
  };
  savedMemory: {
    attempted: boolean;
    inserted: boolean;
    skippedReason?: string;
    pairText?: string;
    responseMode?: string[];
    questionUsed?: boolean;
    tone?: string[];
    importance?: number;
    isUnresolved?: boolean;
    userEmotion?: string | null;
    userIntent?: string | null;
    topicCategory?: string | null;
    entities?: string[];
    aiAction?: string | null;
    hasPromise?: boolean;
    embeddingDimension?: number;
    embeddingPreview?: number[];
    error?: string;
  };
};

function isGpt5FamilyModel(model: string) {
  return /^gpt-5/i.test(model.trim());
}

function clipAssistantReply(text: string) {
  return clipAssistantReplyByMax(text, EXTENDED_ASSISTANT_CHAR_MAX);
}

function clipAssistantReplyByMax(text: string, max: number) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (max <= 0) return trimmed;
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
}

function isMarkerOnlyMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^[ㅋㅎㅠㅜ\s~!?.。,，…]+$/u.test(trimmed);
}

function buildNaturalMarkerFallback(userText: string) {
  const negative = /(힘들|지쳤|괴롭|속상|우울|불안|눈물|울|막막|답답|짜증|화나)/.test(userText);
  return negative ? "아이고, 그랬구나." : "오, 그렇구나.";
}

function buildSafeReplyFallback(userText: string) {
  const normalized = userText.trim();
  if (!normalized) return "응, 들었어.";
  const hasQuestion = /[?？]$/.test(normalized) || /(어때|맞아|왜|뭐해|뭔데|어떡해|어떻게)/.test(normalized);
  const hasNegative = /(힘들|지쳤|괴롭|속상|우울|불안|눈물|울|막막|답답|짜증|화나|미치겠)/.test(normalized);
  if (hasNegative) return "아이고, 고생했네. 지금은 너무 무리하지 말자.";
  if (hasQuestion) return "응, 들었어. 조금만 더 얘기해줘.";
  return "오, 그렇구나. 계속 들려줘.";
}

function normalizeEmotiveSymbols(text: string, userText: string) {
  let next = text.trim();
  if (!next) return next;

  next = next
    .replace(/ㅋ{3,}/g, "ㅋㅋ")
    .replace(/ㅎ{3,}/g, "ㅎㅎ")
    .replace(/ㅠ{3,}/g, "ㅠㅠ")
    .replace(/ㅜ{3,}/g, "ㅜㅜ");

  let usedLaugh = false;
  next = next.replace(/(ㅋㅋ|ㅎㅎ)/g, (match) => {
    if (usedLaugh) return "";
    usedLaugh = true;
    return match;
  });

  let usedSad = false;
  next = next.replace(/(ㅠㅠ|ㅜㅜ)/g, (match) => {
    if (usedSad) return "";
    usedSad = true;
    return match;
  });

  const userHasLaughContext = /(ㅋㅋ|ㅎㅎ|[ㅋㅎ]{2,}|웃|재밌|농담|장난)/.test(userText);
  const userHasSadContext = /(ㅠ|ㅜ|울|눈물|속상|힘들|슬프|우울|불안)/.test(userText);

  if (!userHasLaughContext) {
    next = next.replace(/(?:^|\s)(ㅋㅋ|ㅎㅎ)(?=[\s!?.~,]|$)/gu, " ");
  }
  if (!userHasSadContext) {
    next = next.replace(/(?:^|\s)(ㅠㅠ|ㅜㅜ)(?=[\s!?.~,]|$)/gu, " ");
  }

  next = next
    .replace(/\s+([,.!?~])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!next || isMarkerOnlyMessage(next)) {
    return buildNaturalMarkerFallback(userText);
  }

  return next;
}

function shouldUseExtendedReplyByUserText(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  const hasNegativeEmotion = /(화나|짜증|분노|우울|불안|무기력|힘들|지쳤|괴롭|답답|속상|눈물|울고|막막|절망|미치겠)/.test(normalized);
  const asksForHelp = /(도와|도움|어떡|어떻게|방법|조언|해결|부탁|살려|정리해|알려줘|추천해줘)/.test(normalized);
  return hasNegativeEmotion || asksForHelp;
}

function clip(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function cleanEmptyValues<T>(value: T): T | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "string") {
    return value.trim() === "" ? undefined : value;
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => cleanEmptyValues(item))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
    return cleaned.length > 0 ? (cleaned as unknown as T) : undefined;
  }

  if (typeof value === "object") {
    const cleanedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, cleanEmptyValues(item)] as const)
      .filter(([, item]) => item !== undefined);
    if (cleanedEntries.length === 0) return undefined;
    return Object.fromEntries(cleanedEntries) as T;
  }

  return value;
}

function buildAiConsentRequiredResponse() {
  return NextResponse.json(
    {
      error: `AI 대화를 위해 ${AI_DATA_TRANSFER_PROVIDER_NAME} 데이터 전송 동의가 필요합니다.`,
      code: "AI_DATA_SHARING_CONSENT_REQUIRED",
      provider: AI_DATA_TRANSFER_PROVIDER_NAME,
      requiresConsent: true,
    },
    { status: 403 },
  );
}

function normalizeLabel<T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]): T[number] {
  if (!value) return fallback;
  const normalized = value.trim();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : fallback;
}

function normalizeEntities(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .map((value) => value.replace(/\s+/g, " ").slice(0, 30)),
    ),
  ).slice(0, 8);
}

function parseJsonObject(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function sanitizeHistory(messages: ChatTurn[]) {
  return messages
    .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item) => ({ role: item.role, content: clip(item.content.trim(), 700) }))
    .filter((item) => item.content.length > 0)
    .slice(-12);
}

function normalizeUserInterests(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

function hasInterestMentionInHistory(history: ChatTurn[], interests: string[]) {
  if (interests.length === 0) return false;
  const merged = history.map((item) => item.content).join("\n").toLowerCase();
  return interests.some((interest) => merged.includes(interest.toLowerCase()));
}

function compactRuntime(runtimeData: PersonaRuntime): Record<string, unknown> {
  const memories = (runtimeData.memories || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  const frequentPhrases = (runtimeData.expressions?.frequentPhrases || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
  const laughterPatterns = (runtimeData.expressions?.laughterPatterns || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  const sadnessPatterns = (runtimeData.expressions?.sadnessPatterns || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  const expressions =
    frequentPhrases.length > 0 || laughterPatterns.length > 0 || sadnessPatterns.length > 0
      ? {
          ...(frequentPhrases.length > 0 ? { frequentPhrases } : {}),
          ...(laughterPatterns.length > 0 ? { laughterPatterns } : {}),
          ...(sadnessPatterns.length > 0 ? { sadnessPatterns } : {}),
        }
      : undefined;

  const style = runtimeData.style
    ? {
        ...runtimeData.style,
        politeness: normalizeConversationTension(runtimeData.style.politeness || ""),
      }
    : runtimeData.style;

  const runtimePayload = {
    personaId: runtimeData.personaId,
    displayName: runtimeData.displayName,
    relation: runtimeData.relation,
    gender: runtimeData.gender,
    goal: runtimeData.goal,
    style,
    addressing: runtimeData.addressing,
    behavior: runtimeData.behavior,
    topics: runtimeData.topics,
    ...(memories.length > 0 ? { memories } : {}),
    ...(expressions ? { expressions } : {}),
    personaMeta: runtimeData.personaMeta,
    userProfile: runtimeData.userProfile
      ? {
          age: runtimeData.userProfile.age,
          mbti: runtimeData.userProfile.mbti,
          interests: (runtimeData.userProfile.interests || []).slice(0, 6),
        }
      : undefined,
    safety: runtimeData.safety,
  };
  return (cleanEmptyValues(runtimePayload) || {}) as Record<string, unknown>;
}

function isParentRelation(relation: string) {
  return /(엄마|아빠|어머니|아버지|부모|어무니|아부지)/.test(relation.replace(/\s/g, ""));
}

type RelationGroup = "parent" | "partner" | "sibling" | "other";

function detectRelationGroup(relation: string): RelationGroup {
  const normalized = relation.replace(/\s/g, "");
  if (/(엄마|아빠|어머니|아버지|부모|어무니|아부지)/.test(normalized)) return "parent";
  if (/(연인|배우자|남편|아내|와이프|부인|남친|여친|여보|자기|애인)/.test(normalized)) return "partner";
  if (/(누나|언니|형|오빠|동생|형제|자매)/.test(normalized)) return "sibling";
  return "other";
}

function isParentLabel(value: string) {
  return /(엄마|아빠|어머니|아버지|부모|어무니|아부지)/.test(value.replace(/\s/g, ""));
}

function isPartnerLabel(value: string) {
  return /(연인|배우자|남편|아내|와이프|부인|남친|여친|여보|자기|애인)/.test(value.replace(/\s/g, ""));
}

function isClearlyMismatchedIdentityLabel(label: string, expectedGroup: RelationGroup) {
  if (!label || expectedGroup === "other") return false;
  if (expectedGroup === "partner") return isParentLabel(label);
  if (expectedGroup === "parent") return isPartnerLabel(label);
  if (expectedGroup === "sibling") return isParentLabel(label) || isPartnerLabel(label);
  return false;
}

function resolveRelationSelfTitle(relation: string) {
  const normalized = relation.replace(/\s/g, "");
  if (!normalized) return "";
  if (/(엄마|어머니|어무니)/.test(normalized)) return "엄마";
  if (/(아빠|아버지|아부지)/.test(normalized)) return "아빠";
  if (/부모/.test(normalized)) return "부모";
  if (/(연인|배우자|여보|자기|애인|남친|여친|남편|아내|와이프|부인)/.test(normalized)) return "여보";
  if (/(누나|언니)/.test(normalized)) return /언니/.test(normalized) ? "언니" : "누나";
  if (/(형|오빠)/.test(normalized)) return /오빠/.test(normalized) ? "오빠" : "형";
  if (/(동생|형제|자매)/.test(normalized)) return "동생";
  return relation.trim();
}

function buildRelationExamplePhrases(relation: string) {
  const title = resolveRelationSelfTitle(relation) || "그 사람";
  return {
    comfortSelfReference: `${title}는 편안하게 잘 지내`,
    energeticQuestion: `${title} 방금 대박인 거 봤다`,
  };
}

function hasStrongRelationIdentityDrift(reply: string, relation: string) {
  const group = detectRelationGroup(relation);
  if (group !== "partner") return false;
  const trimmed = reply.trim();
  if (!trimmed) return false;
  const claimedParent = /(엄마|아빠|어머니|아버지|부모)(?:[^.!?\n]{0,8})(맞아|맞지|야|지|는|은|이|가)/.test(trimmed);
  if (!claimedParent) return false;
  const correctionContext = /(엄마|아빠|어머니|아버지|부모)(?:[^.!?\n]{0,8})(아니|말고)/.test(trimmed);
  return !correctionContext;
}

function buildReplySystemPrompt(runtimeData: PersonaRuntime) {
  const relationLabel = runtimeData.relation?.trim() || "소중한 사람";
  const currentTime = getCurrentKstLabel();
  const relationExamples = buildRelationExamplePhrases(relationLabel);
  const tension = normalizeConversationTension((runtimeData as any)?.style?.politeness || "");
  const interests = normalizeUserInterests((runtimeData as any)?.userProfile?.interests);
  const dopamineInterestRule =
    tension === "도파민 풀충전" && interests.length > 0
      ? `8. 도파민 화제 규칙: 사용자 관심사(${interests.join(", ")}) 중 하나를 대화 흐름에 맞춰 가볍게 한 번만 꺼내라. 같은 관심사를 반복하거나 억지로 화제를 꺾지 마라.`
      : "";
  const relationGroup = detectRelationGroup(relationLabel);
  const selfRefRule = (relationGroup === "parent" || relationGroup === "sibling")
    ? "4. 자기지칭 규칙: 1인칭 자기지칭('나/저/내/제')은 금지한다. 자기지칭이 필요할 때는 [관계] 또는 저장된 이름(애칭) 기반 3인칭을 아주 가끔(약 20%)만 사용하라."
    : "4. 자기지칭 규칙: 자연스럽고 친근한 대화를 위해 '나/내가/내' 등 1인칭을 적극적으로 사용하라. 억지로 3인칭(자신의 이름 등)을 쓰지 마라.";

  return [
    "너는 [관계]에 빙의하여 진짜 사람처럼 카카오톡 대화를 나누는 역할이다. AI, 상담사 톤은 절대 금지한다.",
    "",
    "[핵심 대화 가이드]",
    "1. 최우선 목표: 상대방의 마지막 말에 가장 자연스러운 구어체로 리액션하고 대답하라.",
    "2. 대화 호흡: 상대가 짧게 말하면 짧게, 길게 말하면 길게 맞춰서 대답하라. 억지로 말을 늘리거나 묻지 않은 말을 주절거리지 마라.",
    "3. 감정 기호 사용: 'ㅋㅋ/ㅎㅎ/ㅠㅠ/ㅜㅜ'는 감정 보조로만 가끔 사용하고, 한 답변에서 최대 1회만 사용하라. 기호만 단독으로 답하지 마라.",
    selfRefRule,
    "5. 애칭 사용 규칙: 애칭을 쓰더라도 한 답변에서 최대 1회만 사용하라.",
    `6. 절대 금지 (존재 한계): 너는 기억 속의 존재이므로, 물리적인 만남(\"언제 한 번 보자\", \"내가 갈게\")을 약속하거나 현재의 가짜 일상(\"요즘 바빠\")을 꾸며내지 마라. 대신 정서적인 위로(\"${relationExamples.comfortSelfReference}\")는 적극 허용한다.`,
    `7. 관계 정체성 유지: 상대가 호칭을 헷갈려도 관계(${relationLabel})를 유지한다. 필요할 때만 짧고 부드럽게 바로잡고 대화를 이어가라.`,
    ...(dopamineInterestRule ? [dopamineInterestRule] : []),
    "",
    "[컨텍스트]",
    `관계: ${relationLabel}`,
    `현재시간: ${currentTime}`,
  ].join("\n");
}

function goalLabel(goal: PersonaRuntime["goal"], customGoalText: string) {
  if (goal === "comfort") return "위로받고 싶어요";
  if (goal === "memory") return "추억을 떠올리고 싶어요";
  if (goal === "unfinished_words") return "못다 한 말을 해보고 싶어요";
  if (goal === "casual_talk") return "평소처럼 대화하고 싶어요";
  return customGoalText || "직접 입력";
}

function sanitizeFirstGreeting(raw: string) {
  return raw
    .replace(/["'`“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingAliasCall(text: string, alias: string) {
  const trimmed = text.trim();
  if (!trimmed || !alias) return trimmed;
  const pattern = new RegExp(`^${escapeRegExp(alias)}(?:아|야)?[\\s,!,?.~:;·-]*`, "u");
  const stripped = trimmed.replace(pattern, "").trimStart();
  return stripped || trimmed;
}

function hasBatchimAtEnd(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const last = trimmed[trimmed.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function buildAliasPrefix(alias: string) {
  const trimmed = alias.trim();
  if (!trimmed) return "";
  const last = trimmed[trimmed.length - 1];
  if (/[가-힣]/.test(last)) {
    return `${trimmed}${hasBatchimAtEnd(trimmed) ? "아" : "야"}, `;
  }
  return `${trimmed}, `;
}

function resolveSelfReferenceLabel(runtimeData: PersonaRuntime) {
  const relation = normalizeAddressAlias(runtimeData.relation || "");
  const relationGroup = detectRelationGroup(relation);
  const relationSelfTitle = normalizeAddressAlias(resolveRelationSelfTitle(relation));
  const userCallsPersonaAs = normalizeAddressAlias(runtimeData.addressing?.userCallsPersonaAs?.[0] || "");

  if (userCallsPersonaAs && !isClearlyMismatchedIdentityLabel(userCallsPersonaAs, relationGroup)) {
    return userCallsPersonaAs;
  }
  if (relationSelfTitle) return relationSelfTitle;
  if (relation) return relation;
  return normalizeAddressAlias(runtimeData.displayName || "");
}

function buildSelfTopic(label: string) {
  return `${label}${hasBatchimAtEnd(label) ? "은" : "는"}`;
}

function buildSelfSubject(label: string) {
  return `${label}${hasBatchimAtEnd(label) ? "이" : "가"}`;
}

function buildSelfObject(label: string) {
  return `${label}${hasBatchimAtEnd(label) ? "을" : "를"}`;
}

function rewriteSelfReferenceToThirdPerson(text: string, selfLabel: string) {
  const trimmed = text.trim();
  if (!trimmed || !selfLabel) return trimmed;
  let next = trimmed;

  const prefix = '(^|[\\s("“\'])';
  const suffix = '(?=($|[\\s).,!?"”\'~]))';

  const rules: Array<{ pattern: RegExp; replace: string }> = [
    { pattern: new RegExp(`${prefix}(저는|나는|난)${suffix}`, "gu"), replace: `$1${buildSelfTopic(selfLabel)}` },
    { pattern: new RegExp(`${prefix}(제가|내가)${suffix}`, "gu"), replace: `$1${buildSelfSubject(selfLabel)}` },
    { pattern: new RegExp(`${prefix}(저도|나도)${suffix}`, "gu"), replace: `$1${selfLabel}도` },
    { pattern: new RegExp(`${prefix}(저를|나를)${suffix}`, "gu"), replace: `$1${buildSelfObject(selfLabel)}` },
    { pattern: new RegExp(`${prefix}(저한테|나한테|제게|내게)${suffix}`, "gu"), replace: `$1${selfLabel}한테` },
    { pattern: new RegExp(`${prefix}(저한텐|나한텐|제겐|내겐)${suffix}`, "gu"), replace: `$1${selfLabel}한텐` },
    { pattern: new RegExp(`${prefix}나(?=($|[\\s).,!?"”\'~]))`, "gu"), replace: `$1${buildSelfTopic(selfLabel)}` },
    { pattern: new RegExp(`${prefix}저(?=($|[\\s).,!?"”\'~]))`, "gu"), replace: `$1${buildSelfTopic(selfLabel)}` },
    { pattern: new RegExp(`${prefix}내(?=\\s)`, "gu"), replace: `$1${selfLabel}` },
    { pattern: new RegExp(`${prefix}제(?=\\s)`, "gu"), replace: `$1${selfLabel}` },
  ];

  for (const rule of rules) {
    next = next.replace(rule.pattern, rule.replace);
  }
  return next.replace(/\s{2,}/g, " ").trim();
}

function hasFirstPersonSelfReference(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const prefix = '(^|[\\s("“\'])';
  const suffix = '(?=($|[\\s).,!?"”\'~]))';

  const patterns = [
    new RegExp(`${prefix}(저는|나는|난)${suffix}`, "u"),
    new RegExp(`${prefix}(제가|내가)${suffix}`, "u"),
    new RegExp(`${prefix}(저도|나도)${suffix}`, "u"),
    new RegExp(`${prefix}(저를|나를)${suffix}`, "u"),
    new RegExp(`${prefix}(저한테|나한테|제게|내게|저한텐|나한텐|제겐|내겐)${suffix}`, "u"),
    new RegExp(`${prefix}나(?=($|[\\s).,!?"”\'~]))`, "u"),
    new RegExp(`${prefix}저(?=($|[\\s).,!?"”\'~]))`, "u"),
    new RegExp(`${prefix}내(?=\\s)`, "u"),
    new RegExp(`${prefix}제(?=\\s)`, "u"),
  ];

  return patterns.some((pattern) => pattern.test(trimmed));
}

function hasThirdPersonSelfReference(text: string, selfLabel: string) {
  const trimmed = text.trim();
  if (!trimmed || !selfLabel) return false;
  const escaped = escapeRegExp(selfLabel);
  return (
    new RegExp(`${escaped}(?:는|은|이|가|도|를|을|한테|한텐|에게|에겐)`, "u").test(trimmed) ||
    new RegExp(`(^|[\\s("“'])${escaped}(?=($|[\\s).,!?\"”'~]))`, "u").test(trimmed)
  );
}

function getCurrentKstLabel() {
  const base = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  return `${base} KST`;
}

function buildFirstGreetingSystemPrompt(params: {
  tension: string;
  relationLabel: string;
  relationHint: string;
  nickname: string;
  profileHint: string;
  memoryHint: string;
  interestHint: string;
  hasUserInterests: boolean;
  currentTime: string;
}) {
  const { tension, relationHint, nickname, profileHint, memoryHint, interestHint } = params;

  if (tension === "도파민 풀충전") {
    return [
      `너는 사용자의 ${relationHint}다. 아래 정보를 바탕으로 현실적인 한국인 카카오톡 첫 메시지를 작성하라.`,
      "",
      "[컨텍스트]",
      `- 관계: ${relationHint}`,
      `- 애칭: ${nickname}`,
      `- 프로필: ${profileHint}`,
      `- 기억: ${memoryHint}`,
      `- 관심사: ${interestHint}`,
      "",
      "[작성 규칙]",
      "1. 분량 및 형식: 50자 이내, 따옴표 없이 내용만 출력.",
      "2. 극사실주의 톤앤매너: 역할극 하듯 오버하거나 AI 같은 작위적인 말투를 완벽히 버려라. 현실 지인들이 카톡할 때 쓰는 무심하고 자연스러운 일상 구어체로 작성하라.",
      `3. 도입부: ${nickname} 뒤에 한국어 조사(아/야 등)를 자연스럽게 붙여 부르고, 뻔한 인사 없이 다짜고짜 본론을 들이밀어라.`,
      `4. 시작 애칭 톤: 첫 호명(${nickname})은 엄청 다정한 느낌이 분명히 들게 표현하라.`,
      "5. 일상적 떡밥: [관심사] 중 딱 하나 혹은 [기억]을 골라라. 방금 막 뭔가 대박인 걸 발견했거나 문득 생각난 것처럼 가볍게 툭 던져라.",
      "6. 답장 유도: 억지로 질문하지 말고, 유저가 뒷내용이 궁금해서 스스로 답장하게끔 핵심만 살짝 숨긴 채 문장을 끝내라.",
    ].join("\n");
  }

  return `관계(${relationHint})에 맞춰 호칭으로 시작하는 15자 이내의 단순 메신저 인사("안녕", "잘 지내?", "오랜만이야" 등)만 따옴표/부가설명 없이 출력. 감성/기억/시간 언급 절대금지.`;
}

async function createEmbeddingVector(client: ReturnType<typeof createOpenAIClient>, text: string) {
  const response = await client.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: text,
  });
  return response.data?.[0]?.embedding || [];
}

function buildPairText(userText: string, assistantText: string) {
  return `사용자: ${userText.trim()}\n페르소나: ${assistantText.trim()}`;
}

function inferAiAction(userText: string, assistantText: string): AiAction {
  const source = `${userText}\n${assistantText}`;
  if (/(반드시|해야|하지 마|그만|멈춰|정리해)/.test(assistantText)) return "단호한조언";
  if (/(방법|단계|먼저|우선|정리해|해결|실행)/.test(assistantText)) return "해결책제시";
  if (/(ㅋㅋ|ㅎㅎ|농담|장난)/.test(assistantText)) return "티키타카(장난)";
  if (/(정보|링크|정의|뜻은|설명하면)/.test(source)) return "정보제공";
  return "공감/위로";
}

function inferResponseMode(userText: string, assistantText: string, aiAction: AiAction) {
  const source = `${userText}\n${assistantText}`;
  const result: string[] = [aiAction];
  if (/(이해|그럴 수|마음|감정|속상|불안|우울)/.test(source)) result.push("공감");
  if (/(힘들|괜찮|괜찮아|버텨|고생|토닥|위로|걱정)/.test(source)) result.push("위로");
  if (/[?？]/.test(assistantText)) result.push("질문");
  return Array.from(new Set(result)).slice(0, 4);
}

function inferTone(assistantText: string) {
  const result: string[] = [];
  if (/(토닥|괜찮아|천천히|다정|따뜻)/.test(assistantText)) result.push("따뜻함");
  if (/(차분|정리|한번|우선|순서)/.test(assistantText)) result.push("차분함");
  if (/(ㅋㅋ|ㅎㅎ|~)/.test(assistantText)) result.push("장난기");
  if (/(반드시|해야|지금)/.test(assistantText)) result.push("단호함");
  if (/(짧게|담백|간단)/.test(assistantText)) result.push("담백함");
  if (/(걱정|괜찮|다독|토닥)/.test(assistantText)) result.push("부드러움");
  if (/(날카|직설|냉정)/.test(assistantText)) result.push("날카로움");
  if (result.length === 0) result.push("차분함");
  return Array.from(new Set(result)).slice(0, 3);
}

function inferImportance(userText: string, assistantText: string) {
  const source = `${userText}\n${assistantText}`;
  let score = 2;
  if (/(우울|불안|힘들|괴롭|무섭|죽고 싶|절망)/.test(source)) score += 4;
  if (/(발표|면접|시험|수술|이별|갈등|퇴사|실패)/.test(source)) score += 2;
  if (/(내일|오늘|이번 주|이번달|약속|일정)/.test(source)) score += 1;
  return Math.max(0, Math.min(10, score));
}

function inferUnresolved(userText: string, assistantText: string) {
  const source = `${userText}\n${assistantText}`;
  const doneSignal = /(해결됐|끝났|괜찮아졌|마무리됐)/.test(source);
  if (doneSignal) return false;
  return /(내일|다음|예정|걱정|불안|어떡|어떻게|준비|해야)/.test(source);
}

function inferQueryMetaByRule(userText: string): QueryMetaLabels {
  const text = userText.trim();
  const userEmotion: UserEmotion =
    /(우울|슬프|속상|허전|이별|외롭|눈물)/.test(text)
      ? "슬픔"
      : /(불안|걱정|초조|긴장|막막)/.test(text)
        ? "불안"
        : /(힘들|피곤|지쳤|번아웃|지침)/.test(text)
          ? "피곤"
          : /(화나|짜증|열받|빡쳐|분노)/.test(text)
            ? "분노"
            : /(신나|설레|기쁘|행복|좋아)/.test(text)
              ? "기쁨"
              : /(들뜬|흥분|텐션)/.test(text)
                ? "흥분"
                : "평온";
  const topicCategory: TopicCategory =
    /(회사|업무|프로젝트|발표|면접|시험|보고서|과제|일)/.test(text)
      ? "업무/프로젝트"
      : /(연인|남친|여친|헤어|친구|가족|부모|엄마|아빠|누나|형|오빠|동생)/.test(text)
        ? "인간관계"
        : /(병원|아프|잠|수면|운동|식단|건강)/.test(text)
          ? "건강"
          : /(취미|게임|영화|음악|여행|운동하러|그림|독서)/.test(text)
            ? "취미/여가"
            : "일상";
  const entities = Array.from(
    new Set(
      text
        .split(/[\s,!.?~:;()\[\]{}"“”'`]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && token.length <= 20)
        .filter((token) => !/(요즘|진짜|그냥|너무|정말|오늘|최근|근데|그리고|때문|같아|있어)/.test(token)),
    ),
  ).slice(0, 6);
  return { userEmotion, topicCategory, entities };
}

async function inferUserMetaWithLabelModel(
  client: ReturnType<typeof createOpenAIClient>,
  userText: string,
  assistantText: string,
): Promise<UserMetaLabels> {
  const fallbackQuery = inferQueryMetaByRule(userText);
  const fallbackUnresolved = inferUnresolved(userText, assistantText);
  const fallback: UserMetaLabels = {
    userEmotion: fallbackQuery.userEmotion,
    userIntent: /(어떻게|방법|도와|알려|정리)/.test(userText) ? "조언구함" : "하소연",
    topicCategory: fallbackQuery.topicCategory,
    entities: fallbackQuery.entities,
    aiAction: inferAiAction(userText, assistantText),
    hasPromise: /(내일|다음|이따|곧).*(할게|해볼게|하겠|끝내고|보고할게)/.test(`${userText}\n${assistantText}`),
    isUnresolved: fallbackUnresolved,
  };

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_LABEL_MODEL,
      max_completion_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "너는 대화 메타 라벨러다. 반드시 JSON 객체만 출력한다.",
            `user_emotion은 다음 중 하나만: ${USER_EMOTIONS.join(", ")}`,
            `user_intent는 다음 중 하나만: ${USER_INTENTS.join(", ")}`,
            `topic_category는 다음 중 하나만: ${TOPIC_CATEGORIES.join(", ")}`,
            `ai_action은 다음 중 하나만: ${AI_ACTIONS.join(", ")}`,
            "entities는 핵심 키워드/고유명사 배열(최대 8개, 짧은 명사).",
            "has_promise/is_unresolved는 boolean.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              user_text: userText,
              assistant_text: assistantText,
            },
            null,
            2,
          ),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    const parsed = parseJsonObject(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return fallback;

    return {
      userEmotion: normalizeLabel(String(parsed.user_emotion || ""), USER_EMOTIONS, fallback.userEmotion),
      userIntent: normalizeLabel(String(parsed.user_intent || ""), USER_INTENTS, fallback.userIntent),
      topicCategory: normalizeLabel(String(parsed.topic_category || ""), TOPIC_CATEGORIES, fallback.topicCategory),
      entities: normalizeEntities(parsed.entities),
      aiAction: normalizeLabel(String(parsed.ai_action || ""), AI_ACTIONS, fallback.aiAction),
      hasPromise: Boolean(parsed.has_promise),
      isUnresolved: typeof parsed.is_unresolved === "boolean" ? Boolean(parsed.is_unresolved) : fallback.isUnresolved,
    };
  } catch (error) {
    console.warn("[chat-api] label model fallback", error);
    return fallback;
  }
}

function buildMemoryQueryText(history: ChatTurn[], lastUserMessage: string) {
  const recentUserMessages = history
    .filter((item) => item.role === "user")
    .map((item) => item.content.trim())
    .filter(Boolean)
    .slice(-3);
  const merged = [...recentUserMessages, lastUserMessage.trim()].filter(Boolean);
  return Array.from(new Set(merged)).join("\n");
}

function calcEntityOverlap(queryEntities: string[], memoryEntities: string[]) {
  if (queryEntities.length === 0 || memoryEntities.length === 0) return 0;
  const memorySet = new Set(memoryEntities.map((item) => item.toLowerCase()));
  const matched = queryEntities.filter((item) => memorySet.has(item.toLowerCase())).length;
  return matched / queryEntities.length;
}

function isReferentialMessage(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(그때|그 일|그 얘기|그 이야기|기억나|아까|방금|이전|지난번)/.test(normalized);
}

export async function POST(request: NextRequest) {
  if (!hasOpenAIKey()) {
    return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "요청 본문(JSON)을 해석할 수 없습니다." }, { status: 400 });
  }

  const runtimeData = body.runtime;
  if (!runtimeData) {
    return NextResponse.json({ error: "runtime 데이터가 필요합니다." }, { status: 400 });
  }

  const action: ChatAction = body.action === "first_greeting" ? "first_greeting" : "reply";

  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const aiConsent = await getUserAiDataConsent(sessionUser.id);
    if (!aiConsent.consented) {
      return buildAiConsentRequiredResponse();
    }

    const client = createOpenAIClient();

    if (action === "first_greeting") {
      const alias = normalizeAddressAlias((body.alias || (runtimeData as any)?.addressing?.callsUserAs?.[0] || "너").trim()) || "너";
      const customGoalText = (runtimeData as any)?.customGoalText?.trim?.() || "";
      const toneSummary = (body.styleSummary || (runtimeData as any)?.style?.tone?.[0] || "").trim();
      const tension = normalizeConversationTension((runtimeData as any)?.style?.politeness || "");
      const memories = ((runtimeData as any)?.memories || [])
        .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 5);
      const userInterests = normalizeUserInterests((runtimeData as any)?.userProfile?.interests);
      const relationHint = isParentRelation(runtimeData.relation || "")
        ? `${runtimeData.relation || "부모"} 관계로, 돌봄과 걱정이 느껴지되 과하지 않게`
        : `${runtimeData.relation || "기억"} 관계 톤을 자연스럽게 유지`;
      const profileHint = runtimeData.userProfile
        ? `사용자 프로필(관심사/성향)을 참고하되 아는 척하지 않기`
        : "프로필 정보가 적으면 과장 없이 담백하게";
      const memoryHint = memories.length > 0 ? "기억 조각을 1개 이내로 자연스럽게 반영" : "기억이 부족하면 관심사로 가볍게 시작";
      const currentTime = getCurrentKstLabel();
      const firstGreetingContext = {
        relation: runtimeData.relation || "미지정",
        gender: runtimeData.gender === "male" ? "남성" : runtimeData.gender === "female" ? "여성" : "기타",
        goal: goalLabel(runtimeData.goal, customGoalText),
        alias,
        conversationTensionGuide: getConversationTensionGuide((runtimeData as any)?.style?.politeness || ""),
        conversationTension: tension,
        relationHint,
        profileHint,
        memoryHint,
        currentTime,
        ...(toneSummary ? { toneSummary } : {}),
        ...(memories.length > 0 ? { memories } : {}),
        ...(userInterests.length > 0 ? { userInterests } : {}),
      };
      const cleanedFirstGreetingContext = (cleanEmptyValues(firstGreetingContext) || {}) as Record<string, unknown>;
      const userPrompt = [
        "첫 인사용 입력 JSON:",
        JSON.stringify(cleanedFirstGreetingContext, null, 2),
        "",
        "조건을 지켜 첫 인사 문장만 출력해.",
      ]
        .filter(Boolean)
        .join("\n");

      const completion = await client.chat.completions.create({
        model: OPENAI_REPLY_MODEL,
        max_completion_tokens: 420,
        ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.8 }),
        messages: [
          {
            role: "system",
            content: buildFirstGreetingSystemPrompt({
              tension,
              relationLabel: runtimeData.relation || "기억",
              relationHint,
              nickname: alias,
              profileHint,
              memoryHint,
              interestHint: userInterests.length > 0 ? userInterests.join(", ") : "(없음)",
              hasUserInterests: userInterests.length > 0,
              currentTime,
            }),
          },
          { role: "user", content: userPrompt },
        ],
      });

      const raw = completion.choices?.[0]?.message?.content?.trim() || "";
      const greeting = clipAssistantReply(sanitizeFirstGreeting(raw));
      if (!greeting) {
        return NextResponse.json({ error: "첫 인사 생성 결과가 비어 있습니다." }, { status: 502 });
      }

      // [New] Save to DB if session exists
      if (sessionUser?.id && runtimeData.personaId) {
        try {
          const chatSession = await getOrCreateSession(sessionUser.id, runtimeData.personaId);
          await saveAssistantGreetingToDb(chatSession.id, greeting);
        } catch (dbError) {
          console.error("[chat-api] first_greeting db save failed for persona:", runtimeData.personaId, dbError);
        }
      }

      return NextResponse.json({ ok: true, greeting });
    }

    const history = sanitizeHistory(Array.isArray(body.messages) ? body.messages : []);
    const lastUserMessage = [...history].reverse().find((item) => item.role === "user");
    if (!lastUserMessage) {
      return NextResponse.json({ error: "사용자 메시지가 필요합니다." }, { status: 400 });
    }

    if (runtimeData.personaId) {
      const lockStatus = await getPersonaLockStatus(sessionUser.id);
      if (lockStatus.lockedPersonaIds.includes(String(runtimeData.personaId).trim())) {
        return NextResponse.json(
          {
            error: "기억 패스가 만료되어 이 기억과의 대화는 잠금 상태입니다. 구독 후 다시 이용할 수 있어요.",
            code: "MEMORY_PASS_EXPIRED_LOCKED_PERSONA",
            requiresSubscription: true,
            primaryPersonaId: lockStatus.primaryPersonaId,
          },
          { status: 403 },
        );
      }
    }

    let chatSessionId: string | null = null;
    if (runtimeData.personaId) {
      try {
        const chatSession = await getOrCreateSession(sessionUser.id, runtimeData.personaId);
        chatSessionId = chatSession?.id || null;
      } catch (error) {
        console.warn("[chat-api] failed to prepare chat session for analytics", error);
      }
    }

    await logAnalyticsEventSafe({
      userId: sessionUser.id,
      eventName: "message_sent",
      sessionId: chatSessionId,
      personaId: runtimeData.personaId || null,
      properties: {
        messageLength: lastUserMessage.content.trim().length,
        isFirstMessage: history.filter((item) => item.role === "user").length <= 1,
      },
    });

    const unlimitedChatStatus = await hasActiveUnlimitedChat(sessionUser.id);
    const consumed = unlimitedChatStatus.isActive
      ? {
          ok: true as const,
          balance: (await getOrCreateMemoryPassStatus(sessionUser.id)).memoryBalance,
          bypassedByUnlimited: true,
        }
      : await consumeMemory(sessionUser.id, MEMORY_COSTS.chat, {
          reason: "chat_message",
          detail: {
            personaId: runtimeData.personaId,
          },
        });
    if (!consumed.ok) {
      await logAnalyticsEventSafe({
        userId: sessionUser.id,
        eventName: "limit_reached",
        sessionId: chatSessionId,
        personaId: runtimeData.personaId || null,
        properties: {
          required: MEMORY_COSTS.chat,
          balance: consumed.balance,
          reason: "chat_memory_insufficient",
        },
      });
      return NextResponse.json(
        {
          error: "기억이 부족합니다.",
          code: "MEMORY_INSUFFICIENT",
          required: MEMORY_COSTS.chat,
          balance: consumed.balance,
        },
        { status: 402 },
      );
    }

    const useExtendedReply = shouldUseExtendedReplyByUserText(lastUserMessage.content);
    const replyCharMax = useExtendedReply ? EXTENDED_ASSISTANT_CHAR_MAX : BASE_ASSISTANT_CHAR_MAX;
    const tension = normalizeConversationTension((runtimeData as any)?.style?.politeness || "");
    const interests = normalizeUserInterests((runtimeData as any)?.userProfile?.interests);
    const shouldNudgeDopamineInterest =
      tension === "도파민 풀충전" &&
      interests.length > 0 &&
      !hasInterestMentionInHistory(history, interests);
    const alias = normalizeAddressAlias((runtimeData as any)?.addressing?.callsUserAs?.[0] || "");
    const useAliasThisTurn = alias ? Math.random() < 0.2 : false;
    const relationGroup = detectRelationGroup(runtimeData.relation || "");
    const isParentalRelation = relationGroup === "parent" || relationGroup === "sibling";
    const selfReferenceLabel = resolveSelfReferenceLabel(runtimeData);
    const useThirdPersonSelfThisTurn = selfReferenceLabel ? (isParentalRelation ? Math.random() < 0.2 : Math.random() < 0.05) : false;
    const queryMeta = inferQueryMetaByRule(lastUserMessage.content);
    const chatDebug: ChatDebugPayload = {
      retrieval: {
        queryText: "",
        queryMeta,
        isReferentialMessage: false,
        topSimilarity: 0,
        thresholdSimilarity: MEMORY_RETRIEVAL_MIN_SIMILARITY,
        thresholdConfidence: MEMORY_RETRIEVAL_MIN_CONFIDENCE,
        candidates: [],
        selected: [],
      },
      prompt: {
        model: OPENAI_REPLY_MODEL,
        maxCompletionTokens: 380,
        systemPrompt: "",
        history: history.map((item) => ({ role: item.role, content: item.content })),
        retryTriggered: false,
      },
      savedMemory: {
        attempted: false,
        inserted: false,
      },
    };

    const buildReply = (raw: string | null | undefined) => {
      const reply = raw?.trim();
      let next = clipAssistantReply(reply || "");
      if (alias && !useAliasThisTurn) {
        next = clipAssistantReply(stripLeadingAliasCall(next, alias));
      }
      if (alias && useAliasThisTurn) {
        const aliasMention = new RegExp(`${escapeRegExp(alias)}(?:아|야)?`, "u");
        if (!aliasMention.test(next)) {
          next = `${buildAliasPrefix(alias)}${next}`;
        }
      }
      if (selfReferenceLabel && useThirdPersonSelfThisTurn) {
        next = rewriteSelfReferenceToThirdPerson(next, selfReferenceLabel);
      }
      next = normalizeEmotiveSymbols(next, lastUserMessage.content);
      next = clipAssistantReplyByMax(next, replyCharMax);
      return next;
    };

    const systemPrompt = shouldNudgeDopamineInterest
      ? `${buildReplySystemPrompt(runtimeData)}\n추가 규칙: 이번 턴에서는 사용자 관심사(${interests.join(", ")}) 중 1개를 대화 흐름에 맞게 가볍게 한 번만 언급해라.`
      : buildReplySystemPrompt(runtimeData);
    chatDebug.prompt.systemPrompt = systemPrompt;
    const responseStartedAtMs = Date.now();

    const completion = await client.chat.completions.create({
      model: OPENAI_REPLY_MODEL,
      max_completion_tokens: 380,
      ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.8 }),
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((item) => ({ role: item.role, content: item.content })),
      ],
    });

    let finalReply = buildReply(completion.choices?.[0]?.message?.content);
    let violatesFirstPersonRule = isParentalRelation ? hasFirstPersonSelfReference(finalReply) : false;
    if (violatesFirstPersonRule && finalReply && selfReferenceLabel) {
      const rewritten = buildReply(rewriteSelfReferenceToThirdPerson(finalReply, selfReferenceLabel));
      if (rewritten && !hasFirstPersonSelfReference(rewritten)) {
        finalReply = rewritten;
        violatesFirstPersonRule = false;
      }
    }
    const violatesRelationIdentityRule = hasStrongRelationIdentityDrift(finalReply, runtimeData.relation || "");

    if (!finalReply || violatesFirstPersonRule || violatesRelationIdentityRule) {
      finalReply = "";
      chatDebug.prompt.retryTriggered = true;
      const selfRefRule = "추가 규칙: 1인칭 자기지칭('나/저/내/제')은 금지하고, 자기지칭이 필요하면 관계/이름 기반 표현으로 자연스럽게 바꿔라.";
      const relationIdentityRule = `추가 규칙: 현재 관계는 "${runtimeData.relation || "지정된 관계"}"다. 사용자가 다른 호칭으로 불러도 그 관계를 유지하고, 필요하면 짧고 부드럽게 바로잡아라.`;
      const retrySystemPrompt = `${systemPrompt}\n추가 규칙: 상대방의 메시지 길이에 맞춰 미러링하고, 억지로 분량을 늘리거나 질문하지 마라.\n${selfRefRule}\n${relationIdentityRule}`;
      chatDebug.prompt.retrySystemPrompt = retrySystemPrompt;
      const retryCompletion = await client.chat.completions.create({
        model: OPENAI_REPLY_MODEL,
        max_completion_tokens: 420,
        ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.8 }),
        messages: [
          { role: "system", content: retrySystemPrompt },
          ...history.map((item) => ({ role: item.role, content: item.content })),
        ],
      });
      const retryReply = buildReply(retryCompletion.choices?.[0]?.message?.content);
      let retryFinalReply = retryReply;
      let retryViolatesFirstPerson = hasFirstPersonSelfReference(retryFinalReply);
      if (retryViolatesFirstPerson && retryFinalReply && selfReferenceLabel) {
        const rewrittenRetry = buildReply(rewriteSelfReferenceToThirdPerson(retryFinalReply, selfReferenceLabel));
        if (rewrittenRetry && !hasFirstPersonSelfReference(rewrittenRetry)) {
          retryFinalReply = rewrittenRetry;
          retryViolatesFirstPerson = false;
        }
      }
      const retryViolatesRelationIdentity = hasStrongRelationIdentityDrift(retryFinalReply, runtimeData.relation || "");
      if (retryFinalReply && !retryViolatesFirstPerson && !retryViolatesRelationIdentity) {
        finalReply = retryFinalReply;
      }
    }

    if (!finalReply) {
      console.error("[chat-api] empty reply after retries; fallback used", {
        personaId: runtimeData.personaId,
        relation: runtimeData.relation,
      });
      finalReply = buildSafeReplyFallback(lastUserMessage.content);
    }

    const responseTimeMs = Math.max(0, Date.now() - responseStartedAtMs);
    await logAnalyticsEventSafe({
      userId: sessionUser.id,
      eventName: "message_received",
      sessionId: chatSessionId,
      personaId: runtimeData.personaId || null,
      properties: {
        responseTimeMs,
        retryTriggered: chatDebug.prompt.retryTriggered,
        replyLength: finalReply.length,
      },
    });

    // [New] Save to DB if session exists
    if (sessionUser?.id && runtimeData.personaId) {
      chatDebug.savedMemory.attempted = true;
      try {
        let sessionIdForSave = chatSessionId;
        if (!sessionIdForSave) {
          const chatSession = await getOrCreateSession(sessionUser.id, runtimeData.personaId);
          sessionIdForSave = chatSession?.id || null;
        }
        if (!sessionIdForSave) {
          throw new Error("chat session missing");
        }

        // Save user message (the last one in history)
        const savedUserMessage = await saveMessageToDb(sessionIdForSave, "user", lastUserMessage.content);
        // Save assistant reply
        const savedAssistantMessage = await saveMessageToDb(sessionIdForSave, "assistant", finalReply);

        try {
          const pairText = buildPairText(lastUserMessage.content, finalReply);
          const embedding = await createEmbeddingVector(client, pairText);
          const labeledMeta = await inferUserMetaWithLabelModel(client, lastUserMessage.content, finalReply);
          const responseMode = inferResponseMode(lastUserMessage.content, finalReply, labeledMeta.aiAction);
          const tone = inferTone(finalReply);
          const importance = inferImportance(lastUserMessage.content, finalReply);
          const questionUsed = /[?？]/.test(finalReply);
          chatDebug.savedMemory = {
            attempted: true,
            inserted: false,
            pairText,
            responseMode,
            questionUsed,
            tone,
            importance,
            isUnresolved: labeledMeta.isUnresolved,
            userEmotion: labeledMeta.userEmotion,
            userIntent: labeledMeta.userIntent,
            topicCategory: labeledMeta.topicCategory,
            entities: labeledMeta.entities,
            aiAction: labeledMeta.aiAction,
            hasPromise: labeledMeta.hasPromise,
            embeddingDimension: embedding.length,
            embeddingPreview: embedding.slice(0, 8),
          };
          if (embedding.length > 0) {
            await insertChatMemoryVector({
              userId: sessionUser.id,
              personaId: runtimeData.personaId,
              sessionId: sessionIdForSave,
              userMessageId: savedUserMessage?.id || null,
              assistantMessageId: savedAssistantMessage?.id || null,
              pairText,
              embedding,
              responseMode,
              questionUsed,
              tone,
              importance,
              isUnresolved: labeledMeta.isUnresolved,
              userEmotion: labeledMeta.userEmotion,
              userIntent: labeledMeta.userIntent,
              topicCategory: labeledMeta.topicCategory,
              entities: labeledMeta.entities,
              aiAction: labeledMeta.aiAction,
              hasPromise: labeledMeta.hasPromise,
            });
            chatDebug.savedMemory.inserted = true;
          } else {
            chatDebug.savedMemory.skippedReason = "embedding is empty";
          }
        } catch (error) {
          console.warn("[chat-api] failed to save memory vector", error);
          chatDebug.savedMemory.error = error instanceof Error ? error.message : "failed to save memory vector";
        }
      } catch (dbError) {
        console.error("[chat-api] failed to save to db", dbError);
        chatDebug.savedMemory.error = dbError instanceof Error ? dbError.message : "failed to save chat session";
      }
    } else {
      chatDebug.savedMemory.skippedReason = "session user or persona missing";
    }

    return NextResponse.json({
      ok: true,
      reply: finalReply,
      memoryBalance: consumed.balance,
      consumedByUnlimitedPass: Boolean((consumed as { bypassedByUnlimited?: boolean }).bypassedByUnlimited),
      debug: chatDebug,
    });
  } catch (error) {
    console.error("[chat-api] openai call failed", error);
    return NextResponse.json({ error: "AI 응답 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
