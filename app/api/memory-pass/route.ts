import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { activateMemoryPass, deactivateMemoryPass, getOrCreateMemoryPassStatus } from "@/lib/server/memory-pass";

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

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: "activate" | "deactivate" };
    if (body.action !== "activate" && body.action !== "deactivate") {
      return NextResponse.json({ error: "유효하지 않은 요청입니다." }, { status: 400 });
    }

    const result =
      body.action === "activate"
        ? await activateMemoryPass(sessionUser.id)
        : await deactivateMemoryPass(sessionUser.id);

    const status = await getOrCreateMemoryPassStatus(sessionUser.id);
    return NextResponse.json({
      ok: true,
      result,
      action: body.action,
      ...status,
    });
  } catch (error) {
    console.error("[api-memory-pass] failed to update status", error);
    return NextResponse.json({ error: "기억 패스 상태 변경에 실패했습니다." }, { status: 500 });
  }
}
