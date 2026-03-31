import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { listPaymentCardsForUser } from "@/lib/server/payment-cards";

const STORE_REVIEW_PENDING_MESSAGE =
  "스토어 결제 심사 대기 중입니다. 결제카드 관리는 출시 후 제공됩니다.";

function getSessionUserId(session: unknown) {
  const sessionUser = (session as any)?.user;
  return typeof sessionUser?.id === "string" ? sessionUser.id : "";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const cards = await listPaymentCardsForUser(userId);
    return NextResponse.json({
      ok: true,
      cards: Array.isArray(cards) ? cards : [],
      disabled: true,
      message: STORE_REVIEW_PENDING_MESSAGE,
      code: "STORE_REVIEW_PENDING",
    });
  } catch (error) {
    console.error("[api-payment-cards] failed to fetch cards", error);
    return NextResponse.json({ error: "결제정보를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  void request;
  return NextResponse.json(
    { error: STORE_REVIEW_PENDING_MESSAGE, code: "STORE_REVIEW_PENDING", storePaymentRequired: true },
    { status: 503 },
  );
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  void request;
  return NextResponse.json(
    { error: STORE_REVIEW_PENDING_MESSAGE, code: "STORE_REVIEW_PENDING", storePaymentRequired: true },
    { status: 503 },
  );
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  void request;
  return NextResponse.json(
    { error: STORE_REVIEW_PENDING_MESSAGE, code: "STORE_REVIEW_PENDING", storePaymentRequired: true },
    { status: 503 },
  );
}
