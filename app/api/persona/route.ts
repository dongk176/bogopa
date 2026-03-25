import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { savePersonaToDb, getPersonasForUser, getPersonaById, countPersonasForUser } from "@/lib/server/chat-db";
import { PersonaRuntime } from "@/types/persona";
import { getDbPool } from "@/lib/server/db";
import { MEMORY_COSTS } from "@/lib/memory-pass/config";
import { consumeMemory, getOrCreateMemoryPassStatus } from "@/lib/server/memory-pass";

function trimList(values: string[] | undefined, maxCount: number, maxChars: number) {
    return (values || [])
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.slice(0, maxChars))
        .slice(0, maxCount);
}

function applyRuntimePlanLimits(runtime: PersonaRuntime, options: {
    maxMemoryCount: number;
    maxMemoryChars: number;
    maxPhraseCount: number;
    maxPhraseChars: number;
    keepSummary?: string;
}) {
    return {
        ...runtime,
        summary: options.keepSummary ?? runtime.summary ?? "",
        memories: trimList(runtime.memories, options.maxMemoryCount, options.maxMemoryChars),
        expressions: {
            ...runtime.expressions,
            frequentPhrases: trimList(runtime.expressions?.frequentPhrases, options.maxPhraseCount, options.maxPhraseChars),
        },
    } as PersonaRuntime;
}

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    try {
        const body = await request.json();
        const runtime = body.runtime as PersonaRuntime;
        const avatarUrl = body.avatarUrl as string | null;

        if (!runtime || !runtime.personaId) {
            return NextResponse.json({ error: "유효하지 않은 데이터입니다." }, { status: 400 });
        }

        const memoryPass = await getOrCreateMemoryPassStatus(sessionUser.id);
        const existing = await getPersonaById(runtime.personaId, sessionUser.id);
        const isCreate = !existing;

        if (isCreate) {
            const personaCount = await countPersonasForUser(sessionUser.id);
            if (personaCount >= memoryPass.limits.maxPersonas) {
                return NextResponse.json(
                    { error: "생성 가능한 페르소나 수를 초과했습니다.", code: "PERSONA_LIMIT_REACHED", maxPersonas: memoryPass.limits.maxPersonas },
                    { status: 403 },
                );
            }

            const consumed = await consumeMemory(sessionUser.id, MEMORY_COSTS.personaCreate);
            if (!consumed.ok) {
                return NextResponse.json(
                    {
                        error: "기억이 부족합니다.",
                        code: "MEMORY_INSUFFICIENT",
                        required: MEMORY_COSTS.personaCreate,
                        balance: consumed.balance,
                    },
                    { status: 402 },
                );
            }
        }

        if (!memoryPass.limits.summaryEditable && runtime.summary?.trim()) {
            return NextResponse.json(
                { error: "대화 핵심 성향 작성은 기억 패스 전용 기능입니다.", code: "PREMIUM_REQUIRED" },
                { status: 403 },
            );
        }

        const limitedRuntime = applyRuntimePlanLimits(runtime, {
            maxMemoryCount: memoryPass.limits.memoryItemMaxCount,
            maxMemoryChars: memoryPass.limits.memoryItemCharMax,
            maxPhraseCount: memoryPass.limits.phraseItemMaxCount,
            maxPhraseChars: memoryPass.limits.phraseItemCharMax,
        });

        const name = limitedRuntime.displayName || "알 수 없음";

        await savePersonaToDb(sessionUser.id, limitedRuntime.personaId, name, avatarUrl, {}, limitedRuntime);

        const nextMemoryPass = await getOrCreateMemoryPassStatus(sessionUser.id);
        return NextResponse.json({ ok: true, memoryBalance: nextMemoryPass.memoryBalance });
    } catch (error) {
        console.error("[api-persona] failed to save persona", error);
        return NextResponse.json({ error: "페르소나 저장에 실패했습니다." }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    try {
        const personas = await getPersonasForUser(sessionUser.id);
        return NextResponse.json({ ok: true, personas });
    } catch (error) {
        console.error("[api-persona] failed to fetch personas", error);
        return NextResponse.json({ error: "페르소나 목록을 불러오지 못했습니다." }, { status: 500 });
    }
}
export async function DELETE(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const personaId = searchParams.get("personaId");

        if (!personaId) {
            return NextResponse.json({ error: "personaId가 필요합니다." }, { status: 400 });
        }

        const pool = getDbPool();
        await pool.query(
            `DELETE FROM bogopa.personas WHERE persona_id = $1 AND user_id = $2`,
            [personaId, sessionUser.id]
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[api-persona] failed to delete persona", error);
        return NextResponse.json({ error: "페르소나 삭제에 실패했습니다." }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { personaId, name, avatarUrl } = body;
        const runtime = body.runtime as PersonaRuntime | undefined;

        if (!personaId || !runtime?.personaId) {
            return NextResponse.json({ error: "personaId가 필요합니다." }, { status: 400 });
        }

        const memoryPass = await getOrCreateMemoryPassStatus(sessionUser.id);
        const existing = await getPersonaById(personaId, sessionUser.id);
        if (!existing) {
            return NextResponse.json({ error: "존재하지 않는 페르소나입니다." }, { status: 404 });
        }

        const existingRuntime = existing.runtime as PersonaRuntime | undefined;
        const prevSummary = (existingRuntime?.summary || "").trim();
        const nextSummary = (runtime.summary || "").trim();

        if (!memoryPass.limits.summaryEditable && nextSummary !== prevSummary) {
            return NextResponse.json(
                { error: "대화 핵심 성향 작성은 기억 패스 전용 기능입니다.", code: "PREMIUM_REQUIRED" },
                { status: 403 },
            );
        }

        const limitedRuntime = applyRuntimePlanLimits(runtime, {
            maxMemoryCount: memoryPass.limits.memoryItemMaxCount,
            maxMemoryChars: memoryPass.limits.memoryItemCharMax,
            maxPhraseCount: memoryPass.limits.phraseItemMaxCount,
            maxPhraseChars: memoryPass.limits.phraseItemCharMax,
            keepSummary: memoryPass.limits.summaryEditable ? runtime.summary : prevSummary,
        });

        const resolvedName = limitedRuntime.displayName || name || "알 수 없음";
        await savePersonaToDb(sessionUser.id, personaId, resolvedName, avatarUrl, {}, limitedRuntime);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[api-persona] failed to update persona", error);
        return NextResponse.json({ error: "페르소나 수정에 실패했습니다." }, { status: 500 });
    }
}
