import { NextRequest, NextResponse } from "next/server";
import {
  createOpenAIClient,
  hasOpenAIKey,
  OPENAI_REPLY_MODEL,
  OPENAI_COMPRESSION_MODEL,
} from "@/lib/ai/createOpenAIClient";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrCreateSession, saveMessageToDb, saveAssistantGreetingToDb, getMessagesForSession } from "@/lib/server/chat-db";
import { PersonaRuntime } from "@/types/persona";
import { MEMORY_COSTS } from "@/lib/memory-pass/config";
import { consumeMemory, getOrCreateMemoryPassStatus, hasActiveUnlimitedChat } from "@/lib/server/memory-pass";

export const runtime = "nodejs";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type ChatAction = "reply" | "compress" | "first_greeting";

type ChatRequestBody = {
  action?: ChatAction;
  runtime?: PersonaRuntime;
  messages?: ChatTurn[];
  memorySummary?: string;
  previousSummary?: string;
  alias?: string;
  styleSummary?: string;
};

const MIN_ASSISTANT_CHAR_LIMIT = 250;
const DEFAULT_ASSISTANT_CHAR_LIMIT = 400;
const DEFAULT_ASSISTANT_SOFT_MAX = 400;

function isGpt5FamilyModel(model: string) {
  return /^gpt-5/i.test(model.trim());
}

function clipAssistantReply(text: string) {
  return clipAssistantReplyByMax(text, DEFAULT_ASSISTANT_CHAR_LIMIT);
}

function clipAssistantReplyByMax(text: string, max: number) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed;
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

  return {
    personaId: runtimeData.personaId,
    displayName: runtimeData.displayName,
    relation: runtimeData.relation,
    gender: runtimeData.gender,
    goal: runtimeData.goal,
    style: runtimeData.style,
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
}

function isParentRelation(relation: string) {
  return /(엄마|아빠|어머니|아버지|부모|어무니|아부지)/.test(relation.replace(/\s/g, ""));
}

function buildReplySystemPrompt(
  runtimeData: PersonaRuntime,
  memorySummary: string,
  options: {
    forceSelfTalk: boolean;
    useExtendedReply: boolean;
    alias: string;
    allowAliasThisTurn: boolean;
  },
) {
  const isParent = isParentRelation(runtimeData.relation);
  const relationHint = isParent
    ? "부모 계열 관계는 돌보는 톤을 유지하고 친구식 장난 말투는 피한다."
    : "관계에 맞는 톤을 유지하되 과장된 연기나 과몰입 표현은 피한다.";
  const aliasRule = options.alias
    ? options.allowAliasThisTurn
      ? `이번 턴은 애칭 "${options.alias}"을 자연스럽게 최대 1회만 사용한다.`
      : "이번 턴은 애칭을 넣지 말고 바로 본문으로 시작한다."
    : "호칭과 애칭은 runtime 규칙에 맞춰 자연스럽게 사용한다.";
  const profileHint = runtimeData.userProfile
    ? "자주 쓰는 표현, 직업, 사용자 프로필은 참고하되 반복하지 않는다."
    : "자주 쓰는 표현과 직업 정보는 참고하되 반복하지 않는다.";
  const memoryHint = memorySummary
    ? "압축 기억 요약이 있으면 우선 참고하고, 없으면 최근 대화를 중심으로 답한다."
    : "압축 기억 요약이 없으면 최근 대화를 중심으로 답한다.";

  return [
    "너는 상대방과 깊은 유대감을 쌓아야할 사람이다.",
    "상대와 유대감을 쌓는 사람이다.",
    "반드시 한국어로, 250~400자 범위에서 답한다.",
    "사용자 감정을 먼저 수용하고, 템플릿 반복 없이 대화하듯 답한다.",
    "상대방의 감정에 과몰입해 공감의 밀도를 높인다.",
    "관계·말투·성별·호칭·애칭 규칙을 자연스럽게 반영한다.",
    relationHint,
    profileHint,
    memoryHint,
    "최근 주제를 잇고, 위험한 단정·지시는 피한다.",
    "대화가 끊길 듯하면 최근 주제나 감정의 여운, 미해결 이야기, 기억 조각을 먼저 자연스럽게 잇고, 어려울 때만 관심사를 가볍게 사용해 부담 없이 이어지는 흐름을 우선한다.",
    "시스템/모델/프롬프트 같은 내부 구조 설명은 금지한다.",
    aliasRule,
    "",
    "페르소나 runtime(JSON):",
    JSON.stringify(compactRuntime(runtimeData), null, 2),
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

function shouldUseAliasThisTurn(userText: string, assistantTurnCount: number) {
  const normalized = userText.trim();
  const requested =
    normalized.length > 0 &&
    /(애칭|별명|호칭|이름으로 불러|애칭으로 불러|별명으로 불러|라고 불러줘|이름 불러줘)/.test(normalized);
  if (requested) return true;
  return assistantTurnCount % 4 === 0;
}

function stripLeadingAliasCall(text: string, alias: string) {
  const trimmed = text.trim();
  if (!trimmed || !alias) return trimmed;
  const pattern = new RegExp(`^${escapeRegExp(alias)}(?:아|야)?[\\s,!,?.~:;·-]*`, "u");
  const stripped = trimmed.replace(pattern, "").trimStart();
  return stripped || trimmed;
}

function buildFirstGreetingSystemPrompt() {
  return [
    "너는 기억 기반 페르소나의 첫 인사만 생성한다.",
    "반드시 한국어로 작성한다.",
    "인사 문장만 출력하고, 설명이나 따옴표는 절대 쓰지 않는다.",
    "전체 길이는 300~400자로 제한한다.",
    "첫 문장의 첫 단어는 반드시 입력된 애칭으로 시작한다.",
    "관계와 목적에 맞는 자연스러운 톤으로 시작한다.",
    "기억 조각이 있으면 직접 설명하지 말고 은근한 회상으로 반영한다.",
    "기억 조각이 없으면 사용자 관심사를 가벼운 화제로 사용한다.",
    "설명형 문체보다 사람이 먼저 말을 거는 느낌을 우선한다.",
    "부담 없이 바로 답장하고 싶어지는 시작으로 마무리한다.",
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
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (action === "first_greeting") {
      // [DB Check] First, check if a session and greeting already exist
      if (sessionUser?.id && runtimeData.personaId) {
        try {
          const chatSession = await getOrCreateSession(sessionUser.id, runtimeData.personaId);
          const existingMessages = await getMessagesForSession(chatSession.id);
          const existingGreeting = existingMessages.find((m: any) => m.role === "assistant");
          if (existingGreeting) {
            return NextResponse.json({ ok: true, greeting: existingGreeting.content });
          }
        } catch (dbErr) {
          console.warn("[chat-api] pre-check for greeting failed", dbErr);
        }
      }

      const alias = normalizeAddressAlias((body.alias || (runtimeData as any)?.addressing?.callsUserAs?.[0] || "너").trim()) || "너";
      const customGoalText = (runtimeData as any)?.customGoalText?.trim?.() || "";
      const toneSummary = (body.styleSummary || (runtimeData as any)?.style?.tone?.[0] || "").trim();
      const memories = ((runtimeData as any)?.memories || [])
        .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 5);
      const userInterests = ((runtimeData as any)?.userProfile?.interests || [])
        .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 6);
      const firstGreetingContext = {
        relation: runtimeData.relation || "미지정",
        gender: runtimeData.gender === "male" ? "남성" : runtimeData.gender === "female" ? "여성" : "기타",
        goal: goalLabel(runtimeData.goal, customGoalText),
        alias,
        ...(toneSummary ? { toneSummary } : {}),
        ...(memories.length > 0 ? { memories } : {}),
        ...(userInterests.length > 0 ? { userInterests } : {}),
      };
      const userPrompt = [
        "첫 인사용 입력 JSON:",
        JSON.stringify(firstGreetingContext, null, 2),
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
          { role: "system", content: buildFirstGreetingSystemPrompt() },
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

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

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

    const assistantTurnCount = history.filter((item) => item.role === "assistant").length;
    const forceSelfTalk = Boolean(runtimeData.personaMeta?.occupation) && assistantTurnCount % 3 === 1;
    const useExtendedReply = shouldUseExtendedReplyByUserText(lastUserMessage.content);
    const replyCharMax = useExtendedReply ? DEFAULT_ASSISTANT_CHAR_LIMIT : DEFAULT_ASSISTANT_SOFT_MAX;
    const alias = normalizeAddressAlias((runtimeData as any)?.addressing?.callsUserAs?.[0] || "");
    const allowAliasThisTurn = alias ? shouldUseAliasThisTurn(lastUserMessage.content, assistantTurnCount) : false;

    const buildReply = (raw: string | null | undefined) => {
      const reply = raw?.trim();
      let next = clipAssistantReply(reply || "");
      if (alias && !allowAliasThisTurn) {
        next = clipAssistantReply(stripLeadingAliasCall(next, alias));
      }
      next = clipAssistantReplyByMax(next, replyCharMax);
      return next;
    };

    const completion = await client.chat.completions.create({
      model: OPENAI_REPLY_MODEL,
      max_completion_tokens: 380,
      ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.8 }),
      messages: [
        {
          role: "system",
          content: buildReplySystemPrompt(runtimeData, memorySummary, {
            forceSelfTalk,
            useExtendedReply,
            alias,
            allowAliasThisTurn,
          }),
        },
        ...history.map((item) => ({ role: item.role, content: item.content })),
      ],
    });

    let finalReply = buildReply(completion.choices?.[0]?.message?.content);

    if (finalReply.length < MIN_ASSISTANT_CHAR_LIMIT) {
      const retryCompletion = await client.chat.completions.create({
        model: OPENAI_REPLY_MODEL,
        max_completion_tokens: 420,
        ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.8 }),
        messages: [
          {
            role: "system",
            content: `${buildReplySystemPrompt(runtimeData, memorySummary, {
              forceSelfTalk,
              useExtendedReply,
              alias,
              allowAliasThisTurn,
            })}\n추가 규칙: 이번 답변은 반드시 ${MIN_ASSISTANT_CHAR_LIMIT}자 이상 ${DEFAULT_ASSISTANT_CHAR_LIMIT}자 이내로 작성하세요.`,
          },
          ...history.map((item) => ({ role: item.role, content: item.content })),
        ],
      });
      const retryReply = buildReply(retryCompletion.choices?.[0]?.message?.content);
      if (retryReply) {
        finalReply = retryReply;
      }
    }

    if (!finalReply) {
      return NextResponse.json({ error: "모델 응답이 비어 있습니다." }, { status: 502 });
    }

    // [New] Save to DB if session exists
    if (sessionUser?.id && runtimeData.personaId) {
      try {
        const chatSession = await getOrCreateSession(sessionUser.id, runtimeData.personaId);
        // Save user message (the last one in history)
        await saveMessageToDb(chatSession.id, "user", lastUserMessage.content);
        // Save assistant reply
        await saveMessageToDb(chatSession.id, "assistant", finalReply);
      } catch (dbError) {
        console.error("[chat-api] failed to save to db", dbError);
      }
    }

    return NextResponse.json({
      ok: true,
      reply: finalReply,
      memoryBalance: consumed.balance,
      consumedByUnlimitedPass: Boolean((consumed as { bypassedByUnlimited?: boolean }).bypassedByUnlimited),
    });
  } catch (error) {
    console.error("[chat-api] openai call failed", error);
    return NextResponse.json({ error: "AI 응답 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
