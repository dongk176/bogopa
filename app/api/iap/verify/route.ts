import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { IapPlatform } from "@/lib/iap/catalog";
import { applyVerifiedIapPurchase } from "@/lib/server/iap";
import { logAnalyticsEventSafe } from "@/lib/server/analytics";

type VerifyPurchaseBody = {
  platform?: IapPlatform;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  purchasedAt?: string;
  receiptData?: string;
  purchaseToken?: string;
  signature?: string;
  rawPayload?: Record<string, unknown>;
};

function normalizeNonEmpty(value: string | undefined) {
  return (value || "").trim();
}

function normalizePlatform(value: unknown): IapPlatform | null {
  return value === "ios" || value === "android" ? value : null;
}

function canUseMockVerification() {
  if (process.env.IAP_ALLOW_MOCK_PURCHASES === "true") return true;
  return process.env.NODE_ENV !== "production";
}

function canUseNativeStoreKitVerification(input: VerifyPurchaseBody) {
  if (input.platform !== "ios") return false;
  const raw = (input.rawPayload || {}) as Record<string, unknown>;
  const source = String(raw.source || "").trim().toLowerCase();
  const verificationStatus = String(raw.verificationStatus || "").trim().toLowerCase();
  const isNativeSource = source === "native_storekit2" || source === "native_storekit2_restore";
  return isNativeSource && verificationStatus === "verified";
}

async function verifyWithStore(input: VerifyPurchaseBody) {
  const allowMock = canUseMockVerification();
  if (allowMock) {
    return {
      ok: true,
      provider: input.platform,
      mode: "mock" as const,
    };
  }

  if (canUseNativeStoreKitVerification(input)) {
    return {
      ok: true,
      provider: input.platform,
      mode: "native_storekit2" as const,
    };
  }

  return {
    ok: false,
    code: "STORE_VERIFY_NOT_CONFIGURED",
    message: "스토어 영수증 검증이 아직 연결되지 않았습니다.",
  };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as VerifyPurchaseBody;
  const platform = normalizePlatform(body.platform);
  const productId = normalizeNonEmpty(body.productId);
  const transactionId = normalizeNonEmpty(body.transactionId);

  if (!platform) {
    return NextResponse.json({ error: "platform은 ios 또는 android여야 합니다." }, { status: 400 });
  }
  if (!productId) {
    return NextResponse.json({ error: "productId가 필요합니다." }, { status: 400 });
  }
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId가 필요합니다." }, { status: 400 });
  }

  try {
    const verified = await verifyWithStore(body);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message, code: verified.code }, { status: 501 });
    }

    const applied = await applyVerifiedIapPurchase({
      userId: sessionUser.id,
      platform,
      productId,
      transactionId,
      originalTransactionId: normalizeNonEmpty(body.originalTransactionId),
      purchasedAt: normalizeNonEmpty(body.purchasedAt),
      rawPayload: {
        platform,
        receiptData: normalizeNonEmpty(body.receiptData),
        purchaseToken: normalizeNonEmpty(body.purchaseToken),
        signature: normalizeNonEmpty(body.signature),
        ...(body.rawPayload || {}),
      },
    });

    if (!applied.idempotent) {
      await logAnalyticsEventSafe({
        userId: sessionUser.id,
        eventName: applied.productKey === "memory_pass_monthly" ? "subscription_started" : "token_purchased",
        properties: {
          platform,
          productKey: applied.productKey,
          productId,
          transactionId,
        },
      });
    }

    return NextResponse.json({
      verified: {
        provider: verified.provider,
        mode: verified.mode,
      },
      ...applied,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IAP 검증 처리에 실패했습니다.";

    if (message === "IAP_PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "등록되지 않은 상품입니다." }, { status: 400 });
    }
    if (message === "IAP_TRANSACTION_ALREADY_USED") {
      return NextResponse.json({ error: "이미 다른 계정에서 사용된 거래입니다." }, { status: 409 });
    }

    console.error("[api-iap-verify] failed", error);
    return NextResponse.json({ error: "결제 반영에 실패했습니다." }, { status: 500 });
  }
}
