import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { findIapProductByStoreId, IapPlatform } from "@/lib/iap/catalog";
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
  const isNativeSource = source === "native_storekit2";
  return isNativeSource && verificationStatus === "verified";
}

async function verifyWithStore(
  input: VerifyPurchaseBody,
  context: { productKey: string },
) {
  const nativeStoreKitVerified = canUseNativeStoreKitVerification(input);
  if (nativeStoreKitVerified) {
    return {
      ok: true,
      provider: input.platform,
      mode: "native_storekit2" as const,
    };
  }

  // Subscription must always carry native StoreKit2 verified payload.
  if (context.productKey === "memory_pass_monthly" && input.platform === "ios") {
    return {
      ok: false,
      code: "SUBSCRIPTION_NATIVE_VERIFICATION_REQUIRED",
      message: "구독 결제 검증에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  const allowMock = canUseMockVerification();
  if (allowMock) {
    return {
      ok: true,
      provider: input.platform,
      mode: "mock" as const,
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

  const product = findIapProductByStoreId({
    platform,
    productId,
  });
  if (!product) {
    return NextResponse.json({ error: "등록되지 않은 상품입니다." }, { status: 400 });
  }

  try {
    const verified = await verifyWithStore(body, { productKey: product.key });
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

    if (product.key === "memory_pass_monthly" && !applied.isSubscribed) {
      return NextResponse.json(
        {
          error: "유효한 구독 결제 내역을 확인하지 못했습니다. App Store 결제를 다시 진행해 주세요.",
          code: "SUBSCRIPTION_NOT_ACTIVE_AFTER_VERIFY",
        },
        { status: 409 },
      );
    }

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
    if (message === "IAP_SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT") {
      return NextResponse.json(
        { error: "현재 Apple 계정의 기억 패스는 다른 보고파 계정에 연결되어 있습니다." },
        { status: 409 },
      );
    }

    console.error("[api-iap-verify] failed", error);
    return NextResponse.json({ error: "결제 반영에 실패했습니다." }, { status: 500 });
  }
}
