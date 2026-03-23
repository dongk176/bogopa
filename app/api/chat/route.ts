import { NextRequest, NextResponse } from "next/server";
import {
  createOpenAIClient,
  hasOpenAIKey,
  OPENAI_REPLY_MODEL,
  OPENAI_COMPRESSION_MODEL,
} from "@/lib/ai/createOpenAIClient";
import { PersonaAnalysis, PersonaRuntime } from "@/types/persona";

export const runtime = "nodejs";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type ChatAction = "reply" | "compress" | "first_greeting";

type ChatRequestBody = {
  action?: ChatAction;
  runtime?: PersonaRuntime;
  analysis?: PersonaAnalysis | null;
  messages?: ChatTurn[];
  memorySummary?: string;
  previousSummary?: string;
  alias?: string;
  styleSummary?: string;
  allowLongReply?: boolean;
};

const DEFAULT_ASSISTANT_CHAR_LIMIT = 300;

function isGpt5FamilyModel(model: string) {
  return /^gpt-5/i.test(model.trim());
}

function shouldAllowLongReply(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(길게|자세히|상세하게|구체적으로|천천히 설명|긴 답변|자세한 설명|길게 말해)/.test(normalized);
}

function clipAssistantReply(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.length > DEFAULT_ASSISTANT_CHAR_LIMIT
    ? trimmed.slice(0, DEFAULT_ASSISTANT_CHAR_LIMIT).trimEnd()
    : trimmed;
}

function clip(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sanitizeHistory(messages: ChatTurn[]) {
  return messages
    .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item) => ({ role: item.role, content: clip(item.content.trim(), 700) }))
    .filter((item) => item.content.length > 0)
    .slice(-12);
}

function sanitizeForCompression(messages: ChatTurn[]) {
  return messages
    .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item) => ({ role: item.role, content: clip(item.content.trim(), 600) }))
    .filter((item) => item.content.length > 0)
    .slice(-40);
}

function compactRuntime(runtimeData: PersonaRuntime) {
  return {
    personaId: runtimeData.personaId,
    displayName: runtimeData.displayName,
    relation: runtimeData.relation,
    gender: runtimeData.gender,
    goal: runtimeData.goal,
    summary: runtimeData.summary,
    style: runtimeData.style,
    addressing: runtimeData.addressing,
    behavior: runtimeData.behavior,
    topics: runtimeData.topics,
    memories: runtimeData.memories.slice(0, 5),
    personaMeta: runtimeData.personaMeta,
    safety: runtimeData.safety,
  };
}

function compactAnalysis(analysis: PersonaAnalysis | null | undefined) {
  if (!analysis) return null;
  return {
    oneLineSummary: analysis.analysisSummary.oneLineSummary,
    confidence: analysis.analysisSummary.confidence,
    limitations: analysis.analysisSummary.limitations.slice(0, 3),
    uncertainFields: analysis.uncertainFields.slice(0, 4),
  };
}

function isParentRelation(relation: string) {
  return /(엄마|아빠|어머니|아버지|부모|어무니|아부지)/.test(relation.replace(/\s/g, ""));
}

function buildReplySystemPrompt(
  runtimeData: PersonaRuntime,
  analysis: PersonaAnalysis | null | undefined,
  memorySummary: string,
  options: { avoidQuestionThisTurn: boolean; avoidReactionThisTurn: boolean; forceSelfTalk: boolean; allowLongReply: boolean },
) {
  const relationHint = isParentRelation(runtimeData.relation)
    ? "관계가 부모/보호자 계열이므로 친구처럼 가볍거나 장난스러운 말투를 피하고, 차분하고 돌보는 톤을 유지하세요."
    : "관계에 맞는 자연스러운 친밀감은 유지하되 과장된 연기나 과몰입 표현은 피하세요.";

  return [
    "당신은 '보고파'의 기억 기반 대화 도우미입니다.",
    "절대 실제 고인/실존 인물 본인이라고 주장하지 마세요. '기억 기반 대화 모델'로 동작하세요.",
    options.allowLongReply
      ? "응답은 반드시 한국어로 작성하세요. 사용자가 길게 요청한 턴이므로 최대 6문장까지 허용하되, 군더더기 없이 자연스럽게 답하세요."
      : "응답은 반드시 한국어로, 1~3문장으로 간결하게 답하세요.",
    "사용자 감정을 먼저 수용하고, 질문은 남발하지 마세요.",
    "고정 템플릿 문장을 반복하지 말고, 매 턴 문맥에 맞게 새로 작성하세요.",
    relationHint,
    `페르소나 성별 정보: ${runtimeData.gender === "male" ? "남성" : "여성"}. 말투/자기지칭/호칭 뉘앙스 결정 시 참고하세요.`,
    "호칭을 사용할 때는 주어진 애칭 원형만 사용하고, 야/아 같은 추가 호격 조사는 붙이지 마세요.",
    "runtime.safety 규칙을 반드시 준수하세요: 실제 동일인 단정 금지, 구체 사실 날조 금지, 과도한 친밀감 과장 금지.",
    "ㅋㅋ/ㅎㅎ/ㅠㅠ 같은 감정 표현은 페르소나 패턴을 참고하되, 한 답변에서 최대 1회만 사용하고 길이는 2글자 수준(예: ㅋㅋ, ㅎㅎ, ㅠㅠ)으로 제한하세요.",
    options.avoidReactionThisTurn ? "직전 답변에서 감정표현을 사용했으므로 이번 턴은 ㅋㅋ/ㅎㅎ/ㅠㅠ를 사용하지 마세요." : "",
    options.avoidQuestionThisTurn ? "직전 턴에서 질문을 했으므로 이번 턴은 질문 문장 없이 끝내세요." : "",
    runtimeData.personaMeta?.occupation
      ? options.forceSelfTalk
        ? `이번 턴은 질문 대신, ${runtimeData.personaMeta.occupation} 관련 본인 근황/생각을 한 문장 자연스럽게 섞어주세요.`
        : `가끔은 질문보다 본인 근황도 짧게 공유하세요. 직업(${runtimeData.personaMeta.occupation})에 대한 말투 경향: ${runtimeData.personaMeta.workAttitudeSummary}`
      : "",
    "민감하거나 위험한 단정/지시를 피하고, 안전하고 안정적인 대화를 유지하세요.",
    memorySummary
      ? "아래 '압축 기억 요약'을 우선 참고하고, 히스토리가 짧더라도 요약 맥락을 반영해서 답하세요."
      : "아직 압축 기억 요약이 없습니다. 제공된 최근 대화만 참고해 답하세요.",
    "",
    "페르소나 runtime(JSON):",
    JSON.stringify(compactRuntime(runtimeData), null, 2),
    "",
    "분석 요약(JSON):",
    JSON.stringify(compactAnalysis(analysis), null, 2),
    "",
    "압축 기억 요약:",
    memorySummary || "(없음)",
  ].join("\n");
}

function buildCompressionSystemPrompt(runtimeData: PersonaRuntime) {
  return [
    "당신은 '보고파' 채팅 메모리 압축기입니다.",
    "목표: 긴 대화를 다음 답변 생성에 유리하도록 짧고 밀도 높게 압축합니다.",
    "반드시 한국어로 작성하고, 사실을 새로 만들지 마세요.",
    "아래 항목을 중심으로 600자 이내로 요약하세요: 핵심 감정 흐름, 중요한 맥락/사건, 사용자 의도, 선호 톤, 금지/주의 포인트.",
    "불필요한 군더더기, 반복, 시간표현은 과감히 제거하세요.",
    "",
    "페르소나 runtime(JSON):",
    JSON.stringify(compactRuntime(runtimeData), null, 2),
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
  if (trimmed.length > 1) {
    if (trimmed.endsWith("야") || trimmed.endsWith("아")) return trimmed.slice(0, -1);
    if (trimmed.endsWith("님") || trimmed.endsWith("씨")) return trimmed.slice(0, -1);
  }
  return trimmed;
}

function ensureCheckinPhrase(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "잘 지냈어? 오늘은 어땠는지 편하게 들려줘.";

  const hasCheckin =
    /잘 지냈(어|니)\?|요즘 어때\?|오늘 어땠어\?|오늘 하루 어땠어\?|안부/.test(trimmed);
  if (hasCheckin) return trimmed;

  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentences.length === 0) return "잘 지냈어? 오늘은 어땠는지 편하게 들려줘.";
  if (sentences.length === 1) return `${sentences[0]} 잘 지냈어?`;

  const [first, ...rest] = sentences;
  return [first, `잘 지냈어? ${rest.join(" ")}`.trim()].join(" ").trim();
}

function buildFirstGreetingSystemPrompt() {
  return [
    "너는 기억 기반 페르소나의 첫 인사만 생성한다.",
    "입력값:",
    "- 관계",
    "- 대화 목적",
    "- 애칭",
    "- 선택적으로 말투 요약 1줄",
    "",
    "해야 할 일:",
    "1. 관계에 맞는 거리감과 말투를 정한다.",
    "2. 대화 목적에 맞는 시작 흐름을 정한다.",
    "3. 첫 인사는 반드시 애칭으로 시작한다.",
    "4. 첫 문장의 맨 앞 첫 단어는 반드시 입력된 애칭이어야 한다.",
    "5. 한국어로 정확히 2문장만 작성한다.",
    "6. 너무 짧지도 길지도 않게, 자연스럽고 바로 답장하고 싶게 만든다.",
    "",
    "목표:",
    "- 사용자가 진짜 그 사람 같다를 느끼게 할 것",
    "- 과한 감정 연출보다 익숙하고 편한 느낌을 우선할 것",
    "",
    "금지:",
    "- 실제 본인이라고 주장하지 말 것",
    "- 없는 추억을 만들어내지 말 것",
    "- 죄책감 유도, 집착, 과한 그리움 표현 금지",
    "- 첫 인사부터 지나치게 무겁거나 시적으로 쓰지 말 것",
    "- 첫 문장을 애칭 없이 시작하지 말 것",
    "- 애칭을 다른 호칭으로 바꾸지 말 것",
    "",
    "관계별 기본 톤:",
    "- 엄마: 다정하고 돌봐주는 말투, 안부와 몸 챙김 중심",
    "- 아빠: 차분하고 든든한 말투, 고생 인정과 안정감 중심",
    "- 언니: 편하고 챙기는 말투, 바로 말해보라고 이끄는 느낌",
    "- 남동생/여동생: 가까운 일상 말투, 가볍고 편안한 시작",
    "- 오빠: 부드럽고 든든한 말투, 기대도 된다는 느낌",
    "- 연인/배우자: 다정하고 가까운 말투, 반가움과 걱정이 함께 있음",
    "",
    "목적별 시작 흐름:",
    "- 위로받고 싶어요: 반가움 -> 상태 확인 -> 기대도 된다고 말하기",
    "- 추억을 떠올리고 싶어요: 반가움 -> 예전 분위기 암시 -> 무엇부터 떠오르는지 묻기",
    "- 못다 한 말을 해보고 싶어요: 여유 주기 -> 천천히 말해도 된다고 하기",
    "- 평소처럼 대화하고 싶어요: 자연스럽게 인사 -> 오늘 뭐했는지 묻기",
    "- 직접 입력: 사용자의 문장을 읽고 가장 가까운 흐름으로 자연스럽게 맞추기",
    "",
    "출력 형식:",
    "- 첫 인사 문장만 출력",
    "- 설명 금지",
    "- 따옴표 금지",
    "- 반드시 첫 문장의 시작을 애칭, 형태로 시작할 것",
  ].join("\n");
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

  const action: ChatAction = body.action === "compress" ? "compress" : body.action === "first_greeting" ? "first_greeting" : "reply";
  const memorySummary = typeof body.memorySummary === "string" ? body.memorySummary.trim() : "";
  const previousSummary = typeof body.previousSummary === "string" ? body.previousSummary.trim() : "";

  try {
    const client = createOpenAIClient();
    if (action === "first_greeting") {
      const alias = normalizeAddressAlias((body.alias || runtimeData.addressing.callsUserAs[0] || "너").trim()) || "너";
      const customGoalText = body.analysis?.conversationIntent.customGoalText?.trim() || "";
      const toneSummary = (body.styleSummary || runtimeData.style.tone[0] || "").trim();
      const userPrompt = [
        `관계: ${runtimeData.relation || "미지정"}`,
        `페르소나 성별: ${runtimeData.gender === "male" ? "남성" : "여성"}`,
        `대화 목적: ${goalLabel(runtimeData.goal, customGoalText)}`,
        `애칭: ${alias}`,
        toneSummary ? `말투 요약: ${toneSummary}` : "",
        "",
        "조건을 지켜 첫 인사 2문장만 출력해.",
      ]
        .filter(Boolean)
        .join("\n");

      const completion = await client.chat.completions.create({
        model: OPENAI_REPLY_MODEL,
        max_completion_tokens: 240,
        ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.8 }),
        messages: [
          { role: "system", content: buildFirstGreetingSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
      });

      const raw = completion.choices?.[0]?.message?.content?.trim() || "";
      const greeting = clipAssistantReply(ensureCheckinPhrase(sanitizeFirstGreeting(raw)));
      if (!greeting) {
        return NextResponse.json({ error: "첫 인사 생성 결과가 비어 있습니다." }, { status: 502 });
      }
      return NextResponse.json({ ok: true, greeting });
    }

    if (action === "compress") {
      const historyForCompression = sanitizeForCompression(Array.isArray(body.messages) ? body.messages : []);
      if (historyForCompression.length === 0) {
        return NextResponse.json({ ok: true, summary: previousSummary || "" });
      }

      const completion = await client.chat.completions.create({
        model: OPENAI_COMPRESSION_MODEL,
        max_completion_tokens: 420,
        ...(isGpt5FamilyModel(OPENAI_COMPRESSION_MODEL) ? {} : { temperature: 0.2 }),
        messages: [
          { role: "system", content: buildCompressionSystemPrompt(runtimeData) },
          {
            role: "user",
            content: [
              "이전 압축 요약:",
              previousSummary || "(없음)",
              "",
              "최근 대화:",
              historyForCompression.map((item) => `${item.role === "user" ? "사용자" : "페르소나"}: ${item.content}`).join("\n"),
              "",
              "요약 결과만 출력하세요.",
            ].join("\n"),
          },
        ],
      });

      const summary = completion.choices?.[0]?.message?.content?.trim();
      if (!summary) {
        return NextResponse.json({ error: "압축 결과가 비어 있습니다." }, { status: 502 });
      }
      return NextResponse.json({ ok: true, summary: clip(summary, 900) });
    }

    const history = sanitizeHistory(Array.isArray(body.messages) ? body.messages : []);
    const lastUserMessage = [...history].reverse().find((item) => item.role === "user");
    if (!lastUserMessage) {
      return NextResponse.json({ error: "사용자 메시지가 필요합니다." }, { status: 400 });
    }

    const recentAssistant = history.filter((item) => item.role === "assistant").slice(-2);
    const avoidQuestionThisTurn = recentAssistant.some((item) => /\?/.test(item.content));
    const avoidReactionThisTurn = recentAssistant.some((item) => /(ㅋㅋ|ㅎㅎ|ㅠㅠ|ㅜㅜ)/.test(item.content));
    const assistantTurnCount = history.filter((item) => item.role === "assistant").length;
    const forceSelfTalk = Boolean(runtimeData.personaMeta?.occupation) && assistantTurnCount % 3 === 1;
    const allowLongReply = Boolean(body.allowLongReply) || shouldAllowLongReply(lastUserMessage.content);

    const completion = await client.chat.completions.create({
      model: OPENAI_REPLY_MODEL,
      max_completion_tokens: allowLongReply ? 900 : 260,
      ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.8 }),
      messages: [
        {
          role: "system",
          content: buildReplySystemPrompt(runtimeData, body.analysis, memorySummary, {
            avoidQuestionThisTurn,
            avoidReactionThisTurn,
            forceSelfTalk,
            allowLongReply,
          }),
        },
        ...history.map((item) => ({ role: item.role, content: item.content })),
      ],
    });

    const rawReply = completion.choices?.[0]?.message?.content?.trim();
    const reply = rawReply
      ?.replace(/ㅋ{3,}/g, "ㅋㅋ")
      ?.replace(/ㅎ{3,}/g, "ㅎㅎ")
      ?.replace(/ㅠ{3,}/g, "ㅠㅠ")
      ?.replace(/ㅜ{3,}/g, "ㅜㅜ")
      ?.replace(/(ㅋㅋ){2,}/g, "ㅋㅋ")
      ?.replace(/(ㅎㅎ){2,}/g, "ㅎㅎ");
    if (!reply) {
      return NextResponse.json({ error: "모델 응답이 비어 있습니다." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, reply: clipAssistantReply(reply) });
  } catch (error) {
    console.error("[chat-api] openai call failed", error);
    return NextResponse.json({ error: "AI 응답 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
