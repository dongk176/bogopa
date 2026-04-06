import { NextResponse } from "next/server";
import { processAppleServerNotification } from "@/lib/server/apple-subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppleNotificationBody = {
  signedPayload?: string;
};

function normalizeNonEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as AppleNotificationBody;
  const signedPayload = normalizeNonEmpty(body.signedPayload);

  if (!signedPayload) {
    return NextResponse.json(
      {
        error: "signedPayload가 필요합니다.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await processAppleServerNotification({ signedPayload });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "APPLE_NOTIFICATION_FAILED";
    console.error("[api-iap-apple-notifications] failed", error);

    const status =
      message === "APPLE_NOTIFICATION_PAYLOAD_REQUIRED" ||
      message === "APPLE_JWS_EMPTY" ||
      message === "APPLE_JWS_CERT_MISSING" ||
      message === "APPLE_JWS_UNSUPPORTED_ALG"
        ? 400
        : 500;

    return NextResponse.json(
      {
        error: "Apple 구독 알림 처리에 실패했습니다.",
        code: message,
      },
      { status },
    );
  }
}
