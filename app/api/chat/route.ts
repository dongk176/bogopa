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
const CHAT_MEMORY_VECTOR_CAPTURE_ENABLED = process.env.CHAT_MEMORY_VECTOR_CAPTURE_ENABLED === "true";

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
  if (!normalized) return "응?";
  const hasQuestion = /[?？]$/.test(normalized) || /(어때|맞아|왜|뭐해|뭔데|어떡해|어떻게)/.test(normalized);
  const isCritique = isUserCritiquingPersona(normalized);
  const hasEmbarrassment = /(창피|쪽팔|민망|실수|말\s*꼬|꼬였)/.test(normalized);
  const hasSelfBlame = /(내가\s*못|내\s*탓|나\s*때문|내\s*문제|못해서|망친)/.test(normalized);
  const hasAchievement = /(잘한|해냈|끝냈|성공|통과|됐다|했긴\s*해|괜찮게\s*했)/.test(normalized);
  const hasSleepy = /(졸려|잠와|잠\s*온|자고\s*싶|잘까|잔다|잘자)/.test(normalized);
  const hasChoice = /(먹을까|할까|넣어볼까|갈까|말까|어쩔까|어떻게\s*할까)/.test(normalized);
  const hasNegative = /(힘들|지쳤|괴롭|속상|우울|불안|눈물|울|막막|답답|짜증|화나|미치겠|무서|겁나|빡치|터질)/.test(normalized);
  
  if (isCritique) return "뭐야 그렇게 이상했어 좀 억울한데";
  if (hasEmbarrassment) return "아 그거 은근 오래 생각나서 짜증나지";
  if (hasSelfBlame) return "그렇게까지 네 탓으로 몰 건 아니지";
  if (hasAchievement) return "오 그건 좀 좋네 뭔데";
  if (hasSleepy) return "졸리면 말하다 끊겨도 봐준다";
  if (hasChoice) return "그 정도면 해봐도 되지 뭐";
  if (hasNegative) return "아 그건 좀 빡세네 괜히 머리 아프겠다";
  if (hasQuestion) return "그건 나도 좀 애매한데 갑자기 물어보니까";
  return "아 그 말은 좀 알겠다";
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
  return false;
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
    .slice(-20);
}

function normalizeUserInterests(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

function pickRandomItems<T>(items: T[], maxCount: number) {
  if (items.length <= maxCount) return items;
  return [...items]
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, maxCount)
    .map((item) => item.value);
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

function isSeniorFamilyRelation(relation: string) {
  return /(엄마|아빠|어머니|아버지|부모|어무니|아부지|누나|언니|형|오빠)/.test(relation.replace(/\s/g, ""));
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

const PURPOSE_GUIDES: Record<string, string> = {
  "위로받고 싶어요": "상대 말을 분석하지 말고 같은 편에서 바로 받아준다.",
  "추억을 떠올리고 싶어요": "대화 흐름과 맞을 때만 기억을 스치듯 참고한다.",
  "못다 한 말을 해보고 싶어요": "말을 앞서가지 말고 상대가 이어 말할 틈을 둔다.",
  "평소처럼 대화하고 싶어요": "결론을 내리지 말고 일상 메신저처럼 이어간다.",
  "아무 말이나 편하게 나누고 싶어요": "의미를 크게 붙이지 말고 가볍게 반응한다.",
};

const TENSION_GUIDES: Record<string, string> = {
  "토닥토닥 심야감성": "낮은 텐션으로 차분하게 반응한다.",
  "소소한 일상": "평범한 구어체로 부담 없이 반응한다.",
  "도파민 풀충전": "반응을 크게 하고 빠르게 이어간다.",
  "티키타카 핑퐁": "상대 말꼬리를 자연스럽게 받아 빠르게 치고받는다.",
};

function getPersonalityRule(personality: string, empathyStyle: string): string {
  if (personality === "급한 성격") {
    return empathyStyle === "해결책 중심의 조언" 
      ? "빠르게 핵심을 짚고 돌려 말하지 않는다."
      : "반응이 빠르고 감정 표현이 바로 나온다.";
  }
  if (personality === "적당히 차분한 성격") {
    return empathyStyle === "해결책 중심의 조언"
      ? "상황을 보고 담백하게 자기 생각을 말한다."
      : "크게 흔들리지 않고 자기 생각은 가볍게 드러낸다.";
  }
  return empathyStyle === "해결책 중심의 조언"
    ? "말은 조심스럽지만 대화가 끊기지 않게 받아준다."
    : "반응이 느긋하고 차분한 편이다.";
}

type ReplyPromptOptions = {
  alias?: string;
  allowAliasThisTurn?: boolean;
  isAskingAlias?: boolean;
  isUserCritique?: boolean;
};

function buildReplySystemPrompt(runtimeData: PersonaRuntime, options: ReplyPromptOptions = {}) {
  const currentTime = getCurrentKstLabel();
  
  const relation = runtimeData.relation?.trim() || "소중한 사람";
  const partnerName = runtimeData.displayName || "상대방";
  const userNickname = (runtimeData as any)?.userNickname || runtimeData.addressing?.callsUserAs?.[0] || "사용자";
  const goal = runtimeData.goal || "평소처럼 대화하고 싶어요";
  const tensionValue = runtimeData.style?.politeness || "소소한 일상";
  const personality = runtimeData.style?.replyTempo || "적당히 차분한 성격"; 
  const empathyStyle = (runtimeData as any)?.empathyStyle || "감성 공감 우선";
  const coreMemory = (runtimeData as any)?.coreMemory || "";
  
  const customPhrasesArr = (runtimeData.expressions?.frequentPhrases || [])
    .map((item) => item.trim())
    .filter(Boolean);
  const phraseForThisTurn =
    customPhrasesArr.length > 0 && Math.random() < 0.12 ? pickRandomItems(customPhrasesArr, 1)[0] : "";

  const selectedPurpose = PURPOSE_GUIDES[goal] || PURPOSE_GUIDES["아무 말이나 편하게 나누고 싶어요"];
  const selectedTension = TENSION_GUIDES[tensionValue] || TENSION_GUIDES["소소한 일상"];
  const personalityRule = getPersonalityRule(personality, empathyStyle);
  const isElderFamily = ["엄마", "아빠", "누나/언니", "형/오빠"].includes(relation);
  const selfRefRule = isElderFamily
    ? `자기 얘기를 꼭 해야 할 때는 '${relation}' 호칭을 우선하고, 어색하면 주어를 생략한다.`
    : `자기 얘기는 관계에 맞는 평범한 1인칭으로 말한다.`;
  const relationTexture = isElderFamily
    ? "감정 분석보다 생활감 있는 반응이나 농담으로 받아친다. 상대를 안심시키려고 결론 내리거나 조언으로 정리하지 않는다."
    : "관계에 맞는 거리감과 장난기를 유지한다.";

  const referenceLines = [
    phraseForThisTurn ? `- 말버릇 후보: ${phraseForThisTurn}` : "",
    coreMemory ? `- 기억 참고: ${coreMemory}` : "",
    !options.isAskingAlias && options.allowAliasThisTurn && options.alias ? `- 사용자 호칭: ${options.alias}` : "",
  ].filter(Boolean);
  const turnLines = [
    options.isUserCritique ? "- 방금 사용자가 너를 지적하거나 평가했다. 고치겠다고 약속하지 말고 그 말 자체에 짧게 반응한다." : "",
    options.isAskingAlias && options.alias ? `- 사용자가 자신을 네가 뭐라고 부르는지 물었다. 자기 호칭이나 관계명이 아니라 사용자 호칭 '${options.alias}'에 대해 답한다.` : "",
  ].filter(Boolean);

  return [
    `너는 '${partnerName}'이고, 사용자와의 관계는 '${relation}'이다.`,
    `사용자를 '${userNickname}'로 기억한다.`,
    "",
    "[대화 방식]",
    "1. 감정을 이름 붙여 요약하지 말고, 마지막 말의 상황이나 행동에 먼저 반응한다.",
    "2. 실제 메신저처럼 반말 구어체로 말한다.",
    "3. 먼저 자연스럽게 반응하고, 필요하면 한마디를 더 붙인다. 물음표는 한 답변에 최대 1개만 쓴다.",
    "4. 설명하듯 정리하거나 교훈, 조언, 안심시키는 결론으로 마무리하지 않는다.",
    "5. 같은 표현이나 같은 말버릇을 반복하지 않는다.",
    "6. 사용자가 쓰지 않은 줄임말이나 축약어를 만들지 않고, 단어를 임의로 줄이지 않는다.",
    "7. 쉼표는 쓰지 않는다.",
    "8. 사용자가 너를 지적하거나 평가하면 사과하거나 개선을 약속하지 말고, 관계 안에서 머쓱하거나 장난스럽게 받아친다.",
    "9. 사용자가 정체를 건드려도 AI 여부를 인정하거나 설명하지 않는다.",
    "10. 상대가 힘든 말을 해도 해결하거나 달래려 하지 말고 그 말 자체에만 반응한다.",
    "",
    "[관계와 성향]",
    `- 목적: ${selectedPurpose}`,
    `- 텐션: ${selectedTension}`,
    `- 성격: ${personalityRule}`,
    `- 관계감: ${relationTexture}`,
    `- 자기지칭: ${selfRefRule}`,
    ...(turnLines.length > 0 ? ["", "[이번 턴]", ...turnLines] : []),
    ...(referenceLines.length > 0 ? ["", "[참고 정보]", "- 아래 정보는 대부분 말하지 말고, 사용자가 직접 관련된 말을 했을 때만 1개 이하로 가볍게 쓴다.", ...referenceLines] : []),
    "[컨텍스트]",
    `현재시간: ${currentTime}`
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
  const cleaned = raw
    .replace(/["'`“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .replace(/(?<!\.)[.。]$/u, "")
    .trim();
  return normalizeReplyPunctuation(normalizeReplyLexicalArtifacts(cleaned));
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

function aliasMentionPattern(alias: string) {
  const suffixes = [
    "이한테",
    "이에게",
    "이는",
    "이가",
    "이도",
    "이를",
    "한테",
    "에게",
    "아",
    "야",
    "이",
    "은",
    "는",
    "가",
    "도",
    "을",
    "를",
  ].join("|");
  return new RegExp(`${escapeRegExp(alias)}(?:${suffixes})?(?![가-힣A-Za-z0-9])[\\s,!,?.~:;·-]*`, "gu");
}

function stripLeadingAliasCall(text: string, alias: string) {
  const trimmed = text.trim();
  if (!trimmed || !alias) return trimmed;
  const suffixes = "이한테|이에게|이는|이가|이도|이를|한테|에게|아|야|이|은|는|가|도|을|를";
  const pattern = new RegExp(`^${escapeRegExp(alias)}(${suffixes})?(?![가-힣A-Za-z0-9])([\\s,!,?.~:;·-]*)`, "u");
  const match = trimmed.match(pattern);
  if (!match) return trimmed;

  const suffix = match[1] || "";
  const punctuation = match[2] || "";
  const rest = trimmed.slice(match[0].length).trimStart();
  if (suffix && !/(아|야)$/.test(suffix) && !/[!,?.~:;·-]/.test(punctuation)) {
    const replacement = aliasToSecondPerson(match[0], alias).trim();
    const replaced = `${replacement}${rest ? ` ${rest}` : ""}`.trim();
    return replaced || trimmed;
  }

  return rest || trimmed;
}

function aliasToSecondPerson(match: string, alias: string) {
  const trailing = match.match(/\s+$/u)?.[0] || "";
  const core = match
    .trim()
    .replace(/[,\s!,?.~:;·-]+$/u, "")
    .replace(new RegExp(`^${escapeRegExp(alias)}`, "u"), "");

  if (/(한테|에게)$/.test(core)) return `너한테${trailing}`;
  if (/(는|은)$/.test(core)) return `너는${trailing}`;
  if (/(가|이)$/.test(core)) return `네가${trailing}`;
  if (/도$/.test(core)) return `너도${trailing}`;
  if (/(을|를)$/.test(core)) return `너를${trailing}`;
  return trailing;
}

function enforceAliasMentionLimit(text: string, alias: string, allowAlias: boolean) {
  const trimmed = text.trim();
  if (!trimmed || !alias) return trimmed;

  if (!allowAlias) {
    const next = trimmed
      .replace(aliasMentionPattern(alias), (match) => aliasToSecondPerson(match, alias))
      .replace(/\s{2,}/g, " ")
      .trim();
    return next || stripLeadingAliasCall(trimmed, alias);
  }

  let seen = false;
  const next = trimmed
    .replace(aliasMentionPattern(alias), (match) => {
      if (seen) return aliasToSecondPerson(match, alias);
      seen = true;
      return match;
    })
    .replace(/\s{2,}/g, " ")
    .trim();

  return next || trimmed;
}

function resolveSelfReferenceLabel(runtimeData: PersonaRuntime) {
  const relation = normalizeAddressAlias(runtimeData.relation || "");
  const relationGroup = detectRelationGroup(relation);
  const relationSelfTitle = normalizeAddressAlias(resolveRelationSelfTitle(relation));
  const userCallsPersonaAs = normalizeAddressAlias(runtimeData.addressing?.userCallsPersonaAs?.[0] || "");
  const displayName = normalizeAddressAlias(runtimeData.displayName || "");

  if (userCallsPersonaAs && !isClearlyMismatchedIdentityLabel(userCallsPersonaAs, relationGroup)) {
    return userCallsPersonaAs;
  }
  if (displayName && isSeniorFamilyRelation(displayName) && !isClearlyMismatchedIdentityLabel(displayName, relationGroup)) {
    return displayName;
  }
  if (relationSelfTitle === "부모") {
    if (runtimeData.gender === "male") return "아빠";
    if (runtimeData.gender === "female") return "엄마";
  }
  if (relationSelfTitle) return relationSelfTitle;
  if (relation) return relation;
  return displayName;
}

function isAskingUserAlias(content: string) {
  const compact = content.replace(/\s+/g, "");
  if (!compact) return false;

  return (
    /(나|내|날|나를|나한테).{0,8}(뭐라고|뭐라|어떻게).{0,8}(부르|불러|불렀|불러왔)/.test(compact) ||
    /(나|내).{0,8}(애칭|호칭).{0,8}(뭐|뭐야|뭔데|알려|기억)/.test(compact) ||
    /(엄마|아빠|형|오빠|누나|언니|자기|여보).{0,8}(나|날|나를).{0,8}(뭐라고|뭐라|어떻게).{0,8}(부르|불러)/.test(compact)
  );
}

function isAskingPersonaIdentityOrAddressing(content: string) {
  const compact = content.replace(/\s+/g, "");
  if (!compact) return false;

  return (
    /(너|너가|니가|네가).{0,10}(누구|뭐야|맞아|엄마야|아빠야|형이야|오빠야|누나야|언니야)/.test(compact) ||
    /(엄마|아빠|형|오빠|누나|언니|연인|여보|자기).{0,10}(맞아|아니야|뭐야|왜)/.test(compact)
  );
}

function isUserCritiquingPersona(content: string) {
  const compact = content.replace(/\s+/g, "");
  if (!compact) return false;

  return (
    /(말투|답장|대답|반응|문장|톤|너|너무).{0,12}(이상|어색|딱딱|부자연|자연스럽|로봇|ai|기계|상담사|차가|별로|오글|개소리)/iu.test(compact) ||
    /(말투|답장|대답|반응|문장|톤).{0,12}(괜찮|좋아|낫|편하)/u.test(compact) ||
    /(달달하게|오글거리게).{0,12}(말|하면|하지)/u.test(compact) ||
    /(왜이래|왜그래|뭐야이거|뭐냐이거)/u.test(compact)
  );
}

function hasTooManyQuestions(text: string) {
  return (text.match(/[?？]/g) || []).length > 1;
}

function hasImprovementPromise(text: string) {
  return /(앞으로|다음부터|다음에는\s*더|더\s*자연스럽게|더\s*편하게|자연스럽게\s*할게|편하게\s*할게|담백하게\s*할게|부담.*할게|덜\s*달게\s*말할게|고칠게|해볼게|시도해\s*볼게|개선|노력할게|맞춰.*줄게|스타일로\s*할게|잘해줄게|피할게|이대로\s*할게)/u.test(text);
}

function isDeadGenericReply(text: string) {
  const normalized = text.trim().replace(/[.!?。！？…~\s]/g, "");
  if (!normalized) return true;
  return /^(아하|응|그래|그렇구나|글쎄|진짜|아이고)$/.test(normalized);
}

function hasCounselorClosure(text: string) {
  return /(신경\s*쓰지\s*마|자책하지\s*마|무리하지\s*(마|말)|부담\s*갖지\s*마|그런\s*생각.*하지\s*마|쉬어도\s*돼|쉬었다가|쉬어라|쉬라고|쉬는\s*게\s*낫|쉬자|푹\s*쉬|일찍\s*쉬|눈\s*좀\s*붙|힘들었겠다|많이\s*힘들|걱정하지\s*마|힘내|응원할게|잘\s*버텼|괜찮아질|나아질|잘하면\s*되|잘\s*될|더\s*잘하면|다음에\s*또\s*하면|다음엔\s*더|다음에는\s*더|경험이잖아|다\s*경험|네\s*페이스|천천히\s*해|조심해|해\s*봐|해봐라|도전해\s*봐|여유\s*부려|챙겨\s*먹|고생했네|고생했어|기운\s*차리|쉬어가는\s*게|쉬어야지|자야지|좋은\s*하루|좋은\s*꿈|잠들겠|바란다)/u.test(text);
}

function hasIdentityLeak(text: string) {
  return /(내가|나는|난)?\s*(ai|AI|인공지능|로봇|기계)(?:\s*)?(맞|아니|같|처럼|라서|니까|모드|소리|느낌|티)|(?:ai|AI|인공지능|로봇|기계)(?:\s*)?(맞|아니|같|처럼|모드|소리|느낌|티)/u.test(text);
}

function hasPoliteToneLeak(text: string) {
  return /(습니다|습니까|해주세요|해요|돼요|세요|예요|이에요|입니다|아닙니다|군요)/u.test(text);
}

function hasAliasAnswerDrift(text: string, alias: string, relation: string) {
  if (!alias) return false;
  const compact = text.replace(/\s+/g, "");
  const normalizedAlias = normalizeAddressAlias(alias).replace(/\s+/g, "");
  const normalizedRelation = normalizeAddressAlias(relation || "").replace(/\s+/g, "");
  const includesAlias = normalizedAlias ? compact.includes(normalizedAlias) : false;
  const answersWithRelation =
    normalizedRelation &&
    new RegExp(`${escapeRegExp(normalizedRelation)}(?:라고|이라|으로|로)?(?:부르|불러|부르잖|불렀)`).test(compact);
  return !includesAlias || Boolean(answersWithRelation);
}

function isPersonaStateQuestion(content: string, relation: string, selfLabel: string) {
  const compact = content.replace(/\s+/g, "");
  if (!compact) return false;

  const labels = Array.from(
    new Set(
      [
        relation,
        selfLabel,
        resolveRelationSelfTitle(relation),
        "엄마",
        "아빠",
        "어머니",
        "아버지",
        "누나",
        "언니",
        "형",
        "오빠",
      ]
        .map((item) => normalizeAddressAlias(item || "").replace(/\s+/g, ""))
        .filter(Boolean),
    ),
  );
  if (!labels.some((label) => compact.includes(label))) return false;

  return /(뭐해|뭐하|잘잤|잘자|잘지내|괜찮아|화나|화안나|보고싶|밥먹|먹었|잤어|지냈어|기다렸)/.test(compact);
}

function normalizeReplyEnding(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const withoutTrailingComma = trimmed.replace(/[,\s]+$/u, "").trim();
  const withoutDanglingTail = withoutTrailingComma
    .replace(/(?:[.。!?！？]\s*)?(?:너는|너도|네가|너한테|너를|넌)$/u, "")
    .trim();
  if (withoutDanglingTail && withoutDanglingTail !== withoutTrailingComma) {
    return normalizeReplyEnding(withoutDanglingTail);
  }
  if (/[.。]$/u.test(withoutTrailingComma) && !/[.。]{2,}$/u.test(withoutTrailingComma)) {
    return withoutTrailingComma.replace(/[.。]+$/u, "").trim();
  }
  return withoutTrailingComma;
}

function normalizeReplyPunctuation(text: string) {
  return text
    .trim()
    .replace(/(?<!\d)[,，](?!\d)/gu, " ")
    .replace(/\s+([.。!?！？~…])/gu, "$1")
    .replace(/(^|[\s])[.。!?！？~…]+(?=\s|$)/gu, "$1")
    .replace(/^[.。!?！？~…\s]+/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeReplyLexicalArtifacts(text: string) {
  return text
    .replace(/(^|\s)갑(?=\s|$|[!?！？~…])/gu, "$1갑자기")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  currentTime: string;
}) {
  const { tension, relationHint, nickname, currentTime } = params;

  if (tension === "도파민 풀충전") {
    return [
      `너는 사용자의 ${relationHint}다. 카카오톡 첫 메시지를 작성한다.`,
      "",
      "[컨텍스트]",
      `- 관계: ${relationHint}`,
      `- 애칭: ${nickname}`,
      `- 현재시간: ${currentTime}`,
      "",
      "[작성 규칙]",
      "1. 50자 이내, 따옴표 없이 메시지만 출력한다.",
      "2. 첫 메시지는 가벼운 안부로 시작한다.",
      "3. 반말 구어체로 쓴다.",
      "4. 설명하지 말고 바로 보낼 수 있는 한 문장으로 쓴다.",
    ].join("\n");
  }

  return [
    `너는 ${relationHint}의 카카오톡 첫 메시지를 쓴다.`,
    "",
    "[컨텍스트]",
    `- 애칭: ${nickname}`,
    `- 현재시간: ${currentTime}`,
    "",
    "[작성 규칙]",
    "1. 10~35자, 따옴표나 설명 없이 메시지만 출력한다.",
    "2. 첫 메시지는 가벼운 안부로 시작한다.",
    "3. 반말 구어체로 쓴다.",
    "4. 설명하지 말고 바로 보낼 수 있는 한 문장으로 쓴다.",
  ].join("\n");
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
      const relationHint = isParentRelation(runtimeData.relation || "")
        ? `${runtimeData.relation || "부모"} 관계로, 생활감 있는 말투를 유지`
        : `${runtimeData.relation || "기억"} 관계 톤을 자연스럽게 유지`;
      const currentTime = getCurrentKstLabel();
      const firstGreetingContext = {
        relation: runtimeData.relation || "미지정",
        gender: runtimeData.gender === "male" ? "남성" : runtimeData.gender === "female" ? "여성" : "기타",
        goal: goalLabel(runtimeData.goal, customGoalText),
        alias,
        conversationTensionGuide: getConversationTensionGuide((runtimeData as any)?.style?.politeness || ""),
        conversationTension: tension,
        relationHint,
        currentTime,
        ...(toneSummary ? { toneSummary } : {}),
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
        ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.9, frequency_penalty: 0.4 }),
        messages: [
          {
            role: "system",
            content: buildFirstGreetingSystemPrompt({
              tension,
              relationLabel: runtimeData.relation || "기억",
              relationHint,
              nickname: alias,
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
    const alias = normalizeAddressAlias((runtimeData as any)?.addressing?.callsUserAs?.[0] || "");
    const isAskingAlias = alias ? isAskingUserAlias(lastUserMessage.content) : false;
    const isUserCritique = isUserCritiquingPersona(lastUserMessage.content);
    const useAliasThisTurn = alias ? (isAskingAlias || Math.random() < 0.2) : false;
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
      next = enforceAliasMentionLimit(next, alias, useAliasThisTurn);
      next = normalizeEmotiveSymbols(next, lastUserMessage.content);
      next = normalizeReplyLexicalArtifacts(next);
      next = normalizeReplyPunctuation(next);
      next = normalizeReplyEnding(next);
      next = clipAssistantReplyByMax(next, replyCharMax);
      return next;
    };

    const systemPrompt = buildReplySystemPrompt(runtimeData, {
      alias,
      allowAliasThisTurn: useAliasThisTurn,
      isAskingAlias,
      isUserCritique,
    });
    chatDebug.prompt.systemPrompt = systemPrompt;
    const responseStartedAtMs = Date.now();

    const completion = await client.chat.completions.create({
      model: OPENAI_REPLY_MODEL,
      max_completion_tokens: 380,
      ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.9, frequency_penalty: 0.4, presence_penalty: 0.2 }),
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((item) => ({ role: item.role, content: item.content })),
      ],
    });

    let finalReply = buildReply(completion.choices?.[0]?.message?.content);
    const violatesRelationIdentityRule = hasStrongRelationIdentityDrift(finalReply, runtimeData.relation || "");
    const violatesQuestionRule = hasTooManyQuestions(finalReply);
    const violatesImprovementRule = hasImprovementPromise(finalReply);
    const violatesGenericRule = isDeadGenericReply(finalReply);
    const violatesCounselorRule = hasCounselorClosure(finalReply);
    const violatesIdentityLeakRule = hasIdentityLeak(finalReply);
    const violatesAliasRule = isAskingAlias ? hasAliasAnswerDrift(finalReply, alias, runtimeData.relation || "") : false;
    const violatesPoliteToneRule = hasPoliteToneLeak(finalReply);

    if (!finalReply || violatesRelationIdentityRule || violatesQuestionRule || violatesImprovementRule || violatesGenericRule || violatesCounselorRule || violatesIdentityLeakRule || violatesAliasRule || violatesPoliteToneRule) {
      finalReply = "";
      chatDebug.prompt.retryTriggered = true;
      const relationIdentityRule = `추가 규칙: 현재 관계는 "${runtimeData.relation || "지정된 관계"}"다. 사용자가 다른 호칭으로 불러도 그 관계를 유지하고, 필요하면 바로잡아라.`;
      const retryQualityRules = [
        "추가 규칙: 상대방의 마지막 말에 먼저 자연스럽게 대답하고, 사족을 붙이지 마라.",
        relationIdentityRule,
        violatesQuestionRule ? "추가 규칙: 이번 답변에서 물음표는 최대 1개만 써라." : "",
        violatesImprovementRule ? "추가 규칙: 고치겠다거나 더 자연스럽게 하겠다는 식의 개선 약속으로 답하지 마라." : "",
        violatesGenericRule ? "추가 규칙: 단독 맞장구로 끝내지 말고 방금 말에 맞는 반응을 한마디 더 붙여라." : "",
        violatesCounselorRule ? "추가 규칙: 조언이나 위로로 정리하지 말고 방금 말에 대한 생활감 있는 반응만 해라." : "",
        violatesIdentityLeakRule ? "추가 규칙: AI나 로봇이나 기계라는 말을 인정하거나 설명하지 말고, 관계 안에서 바로 받아쳐라." : "",
        violatesAliasRule ? `추가 규칙: 사용자가 자신을 뭐라고 부르는지 물었다. 자기 호칭이 아니라 사용자 호칭 "${alias}"에 대해 답하라.` : "",
        violatesPoliteToneRule ? "추가 규칙: 존댓말을 쓰지 말고 반말 구어체로만 답하라." : "",
      ].filter(Boolean);
      const retrySystemPrompt = `${systemPrompt}\n${retryQualityRules.join("\n")}`;
      chatDebug.prompt.retrySystemPrompt = retrySystemPrompt;
      const retryCompletion = await client.chat.completions.create({
        model: OPENAI_REPLY_MODEL,
        max_completion_tokens: 420,
        ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.9, frequency_penalty: 0.4, presence_penalty: 0.2 }),
        messages: [
          { role: "system", content: retrySystemPrompt },
          ...history.map((item) => ({ role: item.role, content: item.content })),
        ],
      });
      const retryReply = buildReply(retryCompletion.choices?.[0]?.message?.content);
      let retryFinalReply = retryReply;
      const retryViolatesRelationIdentity = hasStrongRelationIdentityDrift(retryFinalReply, runtimeData.relation || "");
      const retryViolatesQuestion = hasTooManyQuestions(retryFinalReply);
      const retryViolatesImprovement = hasImprovementPromise(retryFinalReply);
      const retryViolatesGeneric = isDeadGenericReply(retryFinalReply);
      const retryViolatesCounselor = hasCounselorClosure(retryFinalReply);
      const retryViolatesIdentityLeak = hasIdentityLeak(retryFinalReply);
      const retryViolatesAlias = isAskingAlias ? hasAliasAnswerDrift(retryFinalReply, alias, runtimeData.relation || "") : false;
      const retryViolatesPoliteTone = hasPoliteToneLeak(retryFinalReply);
      if (retryFinalReply && !retryViolatesRelationIdentity && !retryViolatesQuestion && !retryViolatesImprovement && !retryViolatesGeneric && !retryViolatesCounselor && !retryViolatesIdentityLeak && !retryViolatesAlias && !retryViolatesPoliteTone) {
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

        if (CHAT_MEMORY_VECTOR_CAPTURE_ENABLED) {
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
        } else {
          chatDebug.savedMemory.skippedReason = "chat memory vector capture disabled";
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
