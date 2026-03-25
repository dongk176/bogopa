import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  deletePaymentCardForUser,
  listPaymentCardsForUser,
  savePaymentCardForUser,
  setDefaultPaymentCardForUser,
} from "@/lib/server/payment-cards";

type SaveCardBody = {
  cardNumber?: string;
  cardPassword2?: string;
  expiry?: string;
  holderType?: "personal" | "corporate" | string;
  birthDate?: string;
  cardAlias?: string;
  setAsDefault?: boolean;
};

type PatchBody = {
  action?: "set_default";
  cardId?: string;
};

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
    return NextResponse.json({ ok: true, cards });
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

  const body = (await request.json().catch(() => ({}))) as SaveCardBody;
  const holderType = body.holderType === "corporate" ? "corporate" : "personal";

  try {
    const saved = await savePaymentCardForUser(userId, {
      cardNumber: body.cardNumber || "",
      cardPassword2: body.cardPassword2 || "",
      expiry: body.expiry || "",
      holderType,
      birthDate: body.birthDate || "",
      cardAlias: body.cardAlias || "",
      setAsDefault: Boolean(body.setAsDefault),
    });
    const cards = await listPaymentCardsForUser(userId);
    return NextResponse.json({ ok: true, card: saved, cards });
  } catch (error) {
    const message = error instanceof Error ? error.message : "결제정보 저장에 실패했습니다.";
    const status = message.includes("입력") || message.includes("형식") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  if (body.action !== "set_default" || !body.cardId) {
    return NextResponse.json({ error: "유효하지 않은 요청입니다." }, { status: 400 });
  }

  try {
    const updated = await setDefaultPaymentCardForUser(userId, body.cardId);
    if (!updated) {
      return NextResponse.json({ error: "카드를 찾을 수 없습니다." }, { status: 404 });
    }
    const cards = await listPaymentCardsForUser(userId);
    return NextResponse.json({ ok: true, card: updated, cards });
  } catch (error) {
    console.error("[api-payment-cards] failed to set default", error);
    return NextResponse.json({ error: "기본카드 설정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const cardId = request.nextUrl.searchParams.get("cardId") || "";
  if (!cardId) {
    return NextResponse.json({ error: "cardId가 필요합니다." }, { status: 400 });
  }

  try {
    const deleted = await deletePaymentCardForUser(userId, cardId);
    if (!deleted) {
      return NextResponse.json({ error: "카드를 찾을 수 없습니다." }, { status: 404 });
    }
    const cards = await listPaymentCardsForUser(userId);
    return NextResponse.json({ ok: true, cards });
  } catch (error) {
    console.error("[api-payment-cards] failed to delete card", error);
    return NextResponse.json({ error: "카드 삭제에 실패했습니다." }, { status: 500 });
  }
}
