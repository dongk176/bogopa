import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { deleteUserAccountData } from "@/lib/server/account-delete";

type DeleteBody = {
  confirmText?: string;
};

const REQUIRED_CONFIRM_TEXT = "탈퇴하기";

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as DeleteBody;
  const confirmText = (body.confirmText || "").trim();
  if (confirmText !== REQUIRED_CONFIRM_TEXT) {
    return NextResponse.json(
      { error: `최종 확인 문구 '${REQUIRED_CONFIRM_TEXT}'를 정확히 입력해주세요.` },
      { status: 400 },
    );
  }

  try {
    await deleteUserAccountData({
      userId: sessionUser.id,
      provider: typeof sessionUser.provider === "string" ? sessionUser.provider : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api-user-account] failed to delete account", error);
    return NextResponse.json({ error: "회원탈퇴 처리에 실패했습니다." }, { status: 500 });
  }
}
