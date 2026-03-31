import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { checkInAttendance, getAttendanceStatus } from "@/lib/server/attendance";

export async function GET() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;

  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const status = await getAttendanceStatus(sessionUser.id);
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    console.error("[api-attendance] failed to fetch attendance status", error);
    return NextResponse.json({ error: "출석 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;

  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const result = await checkInAttendance(sessionUser.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[api-attendance] failed to check-in", error);
    return NextResponse.json({ error: "출석 처리에 실패했습니다." }, { status: 500 });
  }
}
