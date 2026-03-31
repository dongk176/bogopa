import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createOpenAIClient, hasOpenAIKey, OPENAI_REPLY_MODEL } from "@/lib/ai/createOpenAIClient";
import { getPersonaById } from "@/lib/server/chat-db";
import type { PersonaRuntime } from "@/types/persona";
import {
  LetterKind,
  LetterPurpose,
  buildLetterRuntimeContext,
  buildLetterTitle,
  createLetter,
  getLetterById,
  getLettersCountByPersona,
  getRecentChatContext,
  listLetters,
  markLetterAsRead,
  pickRandomLetterPurpose,
} from "@/lib/server/letters";

export const runtime = "nodejs";

type CreateLetterBody = {
  personaId?: string;
  kind?: LetterKind;
  purpose?: LetterPurpose;
};

function isGpt5FamilyModel(model: string) {
  return /^gpt-5/i.test(model.trim());
}

function normalizeKind(raw: unknown): LetterKind {
  return raw === "evening" ? "evening" : "morning";
}

function normalizePurpose(raw: unknown): LetterPurpose {
  if (
    raw === "다정한 안부형" ||
    raw === "조용한 응원형" ||
    raw === "추억 회상형" ||
    raw === "오늘 버티기형" ||
    raw === "짧은 칭찬형" ||
    raw === "계절/날씨 기반형" ||
    raw === "특별한 날 회고형"
  ) {
    return raw;
  }
  return pickRandomLetterPurpose();
}

function buildLetterSystemPrompt() {
  return [
    "너는 '보고파'의 감성 편지 작성 도우미다.",
    "실제 인물이라고 주장하지 말고, 기억 기반 말투로만 편지를 작성한다.",
    "한국어로 작성한다.",
    "형식:",
    "- 제목 없이 본문만 출력",
    "- 3~5문단",
    "- 문단당 1~3문장",
    "- 전체 길이 220~520자",
    "스타일:",
    "- 과장되거나 오글거리는 표현은 피한다.",
    "- 부드럽고 진심 있는 톤을 유지한다.",
    "- 같은 문장 패턴 반복 금지",
    "- 질문은 최대 1개",
    "반영 규칙:",
    "- fixed 블록(관계/말투/공감성향/애칭)을 우선 반영",
    "- daily 블록(핵심기억, 자주쓰는문구, 편지목적, 날짜/시간)을 강하게 반영",
    "- recent_context(최근 4턴 + 요약)를 참고해 오늘의 연결감을 만든다.",
    "- 없는 사실을 새로 만들지 않는다.",
  ].join("\n");
}

function buildLetterUserPrompt(input: {
  runtimeContext: ReturnType<typeof buildLetterRuntimeContext>;
  recentContext: Awaited<ReturnType<typeof getRecentChatContext>>;
}) {
  return [
    "아래 데이터를 바탕으로 오늘 편지 본문만 작성해.",
    "",
    "RUNTIME_CONTEXT(JSON):",
    JSON.stringify(input.runtimeContext, null, 2),
    "",
    "RECENT_CONTEXT(JSON):",
    JSON.stringify(input.recentContext, null, 2),
  ].join("\n");
}

function cleanupLetterBody(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1800);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  const personaId = searchParams.get("personaId")?.trim();
  const markRead = searchParams.get("markRead") === "1";

  try {
    if (id) {
      const letter = await getLetterById(sessionUser.id, id);
      if (!letter) {
        return NextResponse.json({ error: "편지를 찾을 수 없습니다." }, { status: 404 });
      }
      if (markRead && !letter.is_read) {
        await markLetterAsRead(sessionUser.id, id);
        letter.is_read = true;
      }
      return NextResponse.json({ ok: true, letter });
    }

    const letters = await listLetters(sessionUser.id, { personaId: personaId || undefined, take: 80 });
    return NextResponse.json({ ok: true, letters });
  } catch (error) {
    console.error("[api-letters] failed to load", error);
    return NextResponse.json({ error: "편지 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!hasOpenAIKey()) {
    return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateLetterBody;
  const personaId = body.personaId?.trim();
  if (!personaId) {
    return NextResponse.json({ error: "personaId가 필요합니다." }, { status: 400 });
  }

  const kind = normalizeKind(body.kind);
  const purpose = normalizePurpose(body.purpose);

  try {
    const persona = await getPersonaById(personaId, sessionUser.id);
    if (!persona) {
      return NextResponse.json({ error: "기억 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const runtimeData = persona.runtime as PersonaRuntime | null;
    if (!runtimeData || typeof runtimeData !== "object") {
      return NextResponse.json({ error: "유효한 기억 데이터가 없습니다." }, { status: 400 });
    }

    const [recentContext, lettersCount] = await Promise.all([
      getRecentChatContext(sessionUser.id, personaId),
      getLettersCountByPersona(sessionUser.id, personaId),
    ]);

    const runtimeContext = buildLetterRuntimeContext(runtimeData, {
      letterKind: kind,
      purpose,
      lettersCount,
    });

    const client = createOpenAIClient();
    const completion = await client.chat.completions.create({
      model: OPENAI_REPLY_MODEL,
      max_completion_tokens: 780,
      ...(isGpt5FamilyModel(OPENAI_REPLY_MODEL) ? {} : { temperature: 0.9 }),
      messages: [
        { role: "system", content: buildLetterSystemPrompt() },
        {
          role: "user",
          content: buildLetterUserPrompt({
            runtimeContext,
            recentContext,
          }),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    const content = cleanupLetterBody(raw);
    if (!content) {
      return NextResponse.json({ error: "편지 생성 결과가 비어 있습니다." }, { status: 502 });
    }

    const title = buildLetterTitle(kind);
    const letter = await createLetter({
      userId: sessionUser.id,
      personaId,
      kind,
      purpose,
      title,
      content,
    });

    return NextResponse.json({ ok: true, letter });
  } catch (error) {
    console.error("[api-letters] failed to create", error);
    return NextResponse.json({ error: "편지 생성에 실패했습니다." }, { status: 500 });
  }
}

