import { NextResponse } from "next/server";
import { syncAppleSubscriptionStatuses } from "@/lib/server/apple-subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeNonEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAuthorized(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;

  const expectedSecret = normalizeNonEmpty(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET);
  const authorization = normalizeNonEmpty(request.headers.get("authorization"));
  const vercelCronHeader = normalizeNonEmpty(request.headers.get("x-vercel-cron"));

  if (expectedSecret) {
    return authorization === `Bearer ${expectedSecret}`;
  }

  return vercelCronHeader === "1";
}

async function handleRequest(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const limit = Number.isFinite(body?.limit) ? Number(body.limit) : 100;

  try {
    const summary = await syncAppleSubscriptionStatuses({ limit });
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "APPLE_SUBSCRIPTION_SYNC_FAILED";
    console.error("[api-cron-apple-subscriptions] failed", error);

    return NextResponse.json(
      {
        error: "Apple 구독 재동기화에 실패했습니다.",
        code: message,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
