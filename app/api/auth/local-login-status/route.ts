import { NextRequest, NextResponse } from "next/server";
import { getActiveLoginBlock } from "@/lib/server/login-blocks";

export async function GET(request: NextRequest) {
  const configuredId = (process.env.BOGOPA_LOCAL_LOGIN_ID || "bogopa").trim();
  const inputId = (request.nextUrl.searchParams.get("userId") || "").trim();

  if (!inputId || inputId !== configuredId) {
    return NextResponse.json({ ok: true, blocked: false });
  }

  try {
    const blocked = await getActiveLoginBlock({
      provider: "local-password",
      accountKey: inputId,
    });
    return NextResponse.json({
      ok: true,
      blocked: Boolean(blocked?.blockedUntil),
      blockedUntil: blocked?.blockedUntil || null,
    });
  } catch (error) {
    console.error("[api-local-login-status] failed", error);
    return NextResponse.json({ ok: true, blocked: false });
  }
}

