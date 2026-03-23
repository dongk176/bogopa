import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { savePersonaToDb, getPersonasForUser } from "@/lib/server/chat-db";
import { PersonaAnalysis, PersonaRuntime } from "@/types/persona";
import { getDbPool } from "@/lib/server/db";

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    try {
        const body = await request.json();
        const runtime = body.runtime as PersonaRuntime;
        const analysis = body.analysis as PersonaAnalysis;
        const avatarUrl = body.avatarUrl as string | null;

        if (!runtime || !runtime.personaId) {
            return NextResponse.json({ error: "유효하지 않은 데이터입니다." }, { status: 400 });
        }

        const name = runtime.displayName || "알 수 없음";

        await savePersonaToDb(sessionUser.id, runtime.personaId, name, avatarUrl, analysis, runtime);

        return NextResponse.json({ ok: true });
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
        const { personaId, name, avatarUrl, analysis, runtime } = body;

        if (!personaId) {
            return NextResponse.json({ error: "personaId가 필요합니다." }, { status: 400 });
        }

        await savePersonaToDb(sessionUser.id, personaId, name, avatarUrl, analysis, runtime);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[api-persona] failed to update persona", error);
        return NextResponse.json({ error: "페르소나 수정에 실패했습니다." }, { status: 500 });
    }
}

