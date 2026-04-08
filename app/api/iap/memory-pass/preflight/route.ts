import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { findIapProductByStoreId, IapPlatform } from "@/lib/iap/catalog";
import { ensureIapTables } from "@/lib/server/iap";
import { getDbPool } from "@/lib/server/db";

type PreflightBody = {
  platform?: IapPlatform;
  productId?: string;
  originalTransactionId?: string;
};

function normalizeNonEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlatform(value: unknown): IapPlatform | null {
  return value === "ios" || value === "android" ? value : null;
}

function maskOwnerLabel(rawOwner: string) {
  const source = rawOwner.trim();
  if (!source) return "다른 보고파 아이디";
  const localPrefix = "local:";
  const owner = source.startsWith(localPrefix) ? source.slice(localPrefix.length) : source;
  if (owner.length <= 2) return `${owner[0] || "*"}*`;
  if (owner.length <= 4) return `${owner[0]}**${owner[owner.length - 1]}`;
  return `${owner.slice(0, 2)}***${owner.slice(-2)}`;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PreflightBody;
  const platform = normalizePlatform(body.platform);
  const productId = normalizeNonEmpty(body.productId);
  const originalTransactionId = normalizeNonEmpty(body.originalTransactionId);
  const userId = normalizeNonEmpty(sessionUser.id);

  if (!platform) {
    return NextResponse.json({ error: "platform은 ios 또는 android여야 합니다." }, { status: 400 });
  }
  if (!productId || !originalTransactionId) {
    return NextResponse.json({ error: "productId/originalTransactionId가 필요합니다." }, { status: 400 });
  }

  const product = findIapProductByStoreId({ platform, productId });
  if (!product || product.key !== "memory_pass_monthly") {
    return NextResponse.json({ error: "기억 패스 상품만 확인할 수 있습니다." }, { status: 400 });
  }

  try {
    await ensureIapTables();
    const pool = getDbPool();

    const subRes = await pool.query(
      `
      SELECT
        s.user_id,
        s.status,
        s.expires_at,
        u.name
      FROM bogopa.apple_subscriptions s
      LEFT JOIN bogopa.users u ON u.id = s.user_id
      WHERE s.original_transaction_id = $1
      ORDER BY s.updated_at DESC
      LIMIT 1
      `,
      [originalTransactionId],
    );

    const row = subRes.rows[0] as
      | {
          user_id?: string | null;
          status?: string | null;
          expires_at?: string | Date | null;
          name?: string | null;
        }
      | undefined;

    if (!row) {
      return NextResponse.json({ ok: true, blocked: false });
    }

    const ownerUserId = normalizeNonEmpty(row.user_id);
    const ownerName = normalizeNonEmpty(row.name);
    const status = normalizeNonEmpty(row.status).toLowerCase();
    const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
    const notExpired = typeof expiresAtMs === "number" ? expiresAtMs > Date.now() : true;
    const effectivelyActive = status === "active" && notExpired;

    if (ownerUserId && ownerUserId !== userId && effectivelyActive) {
      const ownerLabel = maskOwnerLabel(ownerName || ownerUserId);
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          code: "MEMORY_PASS_OWNED_BY_OTHER_ACTIVE",
          owner: ownerLabel,
          error: `이 Apple 계정 구독은 ${ownerLabel}에 연결되어 있어요. 해당 계정으로 로그인해 주세요.`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, blocked: false });
  } catch (error: any) {
    // If table is not ready, avoid false blocking.
    if (error?.code === "42P01") {
      return NextResponse.json({ ok: true, blocked: false });
    }
    console.error("[api-iap-memory-pass-preflight] failed", error);
    return NextResponse.json({ error: "구독 상태를 확인하지 못했습니다." }, { status: 500 });
  }
}
