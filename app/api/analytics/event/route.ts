import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  ALLOWED_ANALYTICS_EVENT_NAMES,
  AnalyticsEventName,
  logAnalyticsEventSafe,
} from "@/lib/server/analytics";

type EventBody = {
  eventName?: string;
  sessionId?: string;
  personaId?: string;
  properties?: Record<string, unknown>;
};

function normalizeNonEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowedEventName(value: string): value is AnalyticsEventName {
  return (ALLOWED_ANALYTICS_EVENT_NAMES as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as EventBody;
  const eventName = normalizeNonEmpty(body.eventName);

  if (!eventName || !isAllowedEventName(eventName)) {
    return NextResponse.json(
      {
        error: "허용되지 않은 이벤트입니다.",
        allowed: ALLOWED_ANALYTICS_EVENT_NAMES,
      },
      { status: 400 },
    );
  }

  await logAnalyticsEventSafe({
    userId: sessionUser.id,
    eventName,
    sessionId: normalizeNonEmpty(body.sessionId),
    personaId: normalizeNonEmpty(body.personaId),
    properties: body.properties || {},
  });

  return NextResponse.json({ ok: true });
}
