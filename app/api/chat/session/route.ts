import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrCreateSession, getMessagesForSession } from "@/lib/server/chat-db";
import { logAnalyticsEventSafe } from "@/lib/server/analytics";

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const personaId = request.nextUrl.searchParams.get("personaId");
    if (!personaId) return NextResponse.json({ error: "personaId가 필요합니다." }, { status: 400 });

    try {
        const chatSession = await getOrCreateSession(sessionUser.id, personaId);
        await logAnalyticsEventSafe({
            userId: sessionUser.id,
            eventName: "session_start",
            sessionId: chatSession.id,
            personaId,
            properties: {
                source: "chat_session_get",
            },
        });
        const messages = await getMessagesForSession(chatSession.id);

        return NextResponse.json({
            ok: true,
            sessionId: chatSession.id,
            messages: messages.map(m => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt,
            })),
        });
    } catch (error) {
        console.error("[api-chat-session] failed to fetch session", error);
        return NextResponse.json({ error: "세션 정보를 불러오지 못했습니다." }, { status: 500 });
    }
}
export async function DELETE(_request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    return NextResponse.json(
        {
            error: "대화 삭제는 지원하지 않습니다. 데이터 삭제는 계정 탈퇴를 통해서만 가능합니다.",
            code: "DELETION_REQUIRES_ACCOUNT_WITHDRAWAL",
        },
        { status: 403 },
    );
}
