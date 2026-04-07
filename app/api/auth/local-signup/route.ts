import { NextResponse } from "next/server";
import { getActiveLoginBlock } from "@/lib/server/login-blocks";
import { registerLocalPasswordAccount } from "@/lib/server/local-password-auth";

type LocalSignupBody = {
  userId?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LocalSignupBody;
  const userId = String(body.userId || "").trim();
  const password = String(body.password || "");

  if (!userId || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해주세요." }, { status: 400 });
  }

  const blocked = await getActiveLoginBlock({
    provider: "local-password",
    accountKey: userId,
  });
  if (blocked?.blockedUntil) {
    return NextResponse.json(
      {
        error: "탈퇴한 계정은 30일 동안 다시 로그인할 수 없습니다.",
        blockedUntil: blocked.blockedUntil,
      },
      { status: 423 },
    );
  }

  try {
    const created = await registerLocalPasswordAccount({
      loginId: userId,
      password,
    });
    return NextResponse.json({
      ok: true,
      userId: created.userId,
      loginId: created.loginId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOCAL_SIGNUP_FAILED";
    if (message === "LOCAL_ID_INVALID") {
      return NextResponse.json(
        { error: "아이디는 영문/숫자/._- 조합으로 1~32자여야 합니다." },
        { status: 400 },
      );
    }
    if (message === "LOCAL_PASSWORD_INVALID") {
      return NextResponse.json({ error: "비밀번호는 4~64자로 입력해주세요." }, { status: 400 });
    }
    if (message === "LOCAL_ID_RESERVED") {
      return NextResponse.json({ error: "사용할 수 없는 아이디입니다." }, { status: 409 });
    }
    if (message === "LOCAL_ID_ALREADY_EXISTS") {
      return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
    }

    console.error("[api-auth-local-signup] failed", error);
    return NextResponse.json({ error: "아이디 생성에 실패했습니다." }, { status: 500 });
  }
}

