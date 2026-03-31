import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrCreateMemoryPassStatus } from "@/lib/server/memory-pass";

const STORE_REVIEW_PENDING_MESSAGE =
  "스토어 결제 심사 대기 중입니다. 결제 기능은 출시 후 활성화됩니다.";

export async function GET() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const status = await getOrCreateMemoryPassStatus(sessionUser.id);
    return NextResponse.json({
      ok: true,
      ...status,
    });
  } catch (error) {
    console.error("[api-memory-pass] failed to fetch status", error);
    return NextResponse.json({ error: "기억 패스 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  void request;
  return NextResponse.json(
    {
      error: STORE_REVIEW_PENDING_MESSAGE,
      code: "STORE_REVIEW_PENDING",
      storePaymentRequired: true,
    },
    { status: 503 },
  );
}
