import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  getUserAiDataConsent,
  setUserAiDataConsent,
} from "@/lib/server/user-profile";
import {
  AI_DATA_TRANSFER_CONSENT_VERSION,
  AI_DATA_TRANSFER_PROVIDER_NAME,
  AI_DATA_TRANSFER_SUMMARY,
} from "@/lib/ai-consent";

type AiConsentBody = {
  agreed?: boolean;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const consent = await getUserAiDataConsent(sessionUser.id);
    return NextResponse.json({
      ok: true,
      consent,
      requiredVersion: AI_DATA_TRANSFER_CONSENT_VERSION,
      provider: AI_DATA_TRANSFER_PROVIDER_NAME,
      summary: AI_DATA_TRANSFER_SUMMARY,
    });
  } catch (error) {
    console.error("[api-user-ai-consent:get] failed", error);
    return NextResponse.json({ error: "동의 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as AiConsentBody;
  const agreed = body.agreed === true;

  try {
    const consent = await setUserAiDataConsent({
      userId: sessionUser.id,
      agreed,
      version: agreed ? AI_DATA_TRANSFER_CONSENT_VERSION : null,
      source: "settings",
    });

    return NextResponse.json({
      ok: true,
      consent,
      requiredVersion: AI_DATA_TRANSFER_CONSENT_VERSION,
      provider: AI_DATA_TRANSFER_PROVIDER_NAME,
      summary: AI_DATA_TRANSFER_SUMMARY,
    });
  } catch (error) {
    console.error("[api-user-ai-consent:post] failed", error);
    return NextResponse.json({ error: "동의 상태를 저장하지 못했습니다." }, { status: 500 });
  }
}
