import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { findIapProductByStoreId, IapPlatform } from "@/lib/iap/catalog";
import { applyVerifiedIapPurchase } from "@/lib/server/iap";
import { logAnalyticsEventSafe } from "@/lib/server/analytics";
import {
  acknowledgeGooglePlaySubscription,
  consumeGooglePlayProduct,
  verifyGooglePlayProductPurchase,
  verifyGooglePlaySubscriptionPurchase,
} from "@/lib/server/google-play";

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

function normalizeNonEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function extractAndroidPurchaseToken(input: VerifyPurchaseBody) {
  const direct = normalizeNonEmpty(input.purchaseToken);
  if (direct) return direct;
  const raw = (input.rawPayload || {}) as Record<string, unknown>;
  return normalizeNonEmpty(typeof raw.purchaseToken === "string" ? raw.purchaseToken : "");
}

type VerifyWithStoreResult =
  | {
      ok: true;
      provider: IapPlatform;
      mode: "native_storekit2" | "mock";
      transactionId?: string;
      originalTransactionId?: string;
      purchasedAt?: string | null;
      purchaseToken?: string;
      rawPayload?: Record<string, unknown>;
    }
  | {
      ok: true;
      provider: "android";
      mode: "google_play_api";
      transactionId: string;
      originalTransactionId: string;
      purchasedAt: string | null;
      purchaseToken: string;
      rawPayload: Record<string, unknown>;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

async function verifyWithStore(
  input: VerifyPurchaseBody,
  context: { productKey: string; productId: string },
): Promise<VerifyWithStoreResult> {
  const nativeStoreKitVerified = canUseNativeStoreKitVerification(input);
  if (nativeStoreKitVerified) {
    return {
      ok: true,
      provider: "ios",
      mode: "native_storekit2" as const,
    };
  }

  if (input.platform === "android") {
    const purchaseToken = extractAndroidPurchaseToken(input);
    if (!purchaseToken) {
      return {
        ok: false,
        code: "ANDROID_PURCHASE_TOKEN_REQUIRED",
        message: "구매 토큰을 확인하지 못했습니다. 다시 시도해주세요.",
      };
    }

    try {
      if (context.productKey === "memory_pass_monthly") {
        const verified = await verifyGooglePlaySubscriptionPurchase({
          productId: context.productId,
          purchaseToken,
        });
        return verified;
      }

      const verified = await verifyGooglePlayProductPurchase({
        productId: context.productId,
        purchaseToken,
      });
      return verified;
    } catch (error) {
      const message = error instanceof Error ? error.message : "GOOGLE_PLAY_VERIFY_UNKNOWN";
      const normalized = message.toUpperCase();
      const isApiDisabled =
        normalized.includes("SERVICE_DISABLED") ||
        normalized.includes("ANDROIDPUBLISHER.GOOGLEAPIS.COM");
      if (isApiDisabled) {
        return {
          ok: false,
          code: "GOOGLE_PLAY_API_DISABLED",
          message:
            "Google Play 개발자 API가 비활성화되어 결제 검증에 실패했습니다. Console에서 Android Publisher API를 활성화한 뒤 다시 시도해 주세요.",
        };
      }
      const isPermissionDenied =
        normalized.includes("PERMISSION_DENIED") ||
        normalized.includes("THE CURRENT USER HAS INSUFFICIENT PERMISSIONS");
      if (isPermissionDenied) {
        return {
          ok: false,
          code: "GOOGLE_PLAY_PERMISSION_DENIED",
          message:
            "Google Play 서비스 계정 권한이 부족해 결제 검증에 실패했습니다. Play Console > 사용자 및 권한에서 권한을 다시 확인해 주세요.",
        };
      }
      if (message.startsWith("GOOGLE_PLAY_PRODUCT_NOT_PURCHASED")) {
        return {
          ok: false,
          code: "GOOGLE_PLAY_PRODUCT_NOT_PURCHASED",
          message: "결제 승인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
        };
      }
      if (message.startsWith("GOOGLE_PLAY_SUBSCRIPTION_NOT_ACTIVE")) {
        return {
          ok: false,
          code: "GOOGLE_PLAY_SUBSCRIPTION_NOT_ACTIVE",
          message: "유효한 구독 결제 내역을 확인하지 못했습니다. Google Play 결제를 다시 진행해 주세요.",
        };
      }
      if (message.includes("GOOGLE_PLAY_CREDENTIALS_MISSING")) {
        return {
          ok: false,
          code: "GOOGLE_PLAY_NOT_CONFIGURED",
          message: "Google Play 결제 검증 설정이 아직 연결되지 않았습니다.",
        };
      }
      return {
        ok: false,
        code: "GOOGLE_PLAY_VERIFY_FAILED",
        message: "Google Play 결제 검증에 실패했습니다. 잠시 후 다시 시도해주세요.",
      };
    }
  }

  // iOS subscription must always carry native StoreKit2 verified payload.
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
      provider: "ios",
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
    const verified = await verifyWithStore(body, { productKey: product.key, productId });
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message, code: verified.code }, { status: 501 });
    }

    const verifiedTransactionId = normalizeNonEmpty(verified.transactionId);
    const resolvedTransactionId = verifiedTransactionId || transactionId;
    if (!resolvedTransactionId) {
      return NextResponse.json({ error: "거래 정보를 확인하지 못했습니다." }, { status: 400 });
    }
    const resolvedOriginalTransactionId = normalizeNonEmpty(verified.originalTransactionId || body.originalTransactionId);
    const resolvedPurchasedAt = normalizeNonEmpty(verified.purchasedAt || body.purchasedAt);
    const resolvedPurchaseToken = normalizeNonEmpty(verified.purchaseToken || extractAndroidPurchaseToken(body));
    const resolvedRawPayload = {
      ...(body.rawPayload || {}),
      ...(verified.rawPayload || {}),
      platform,
      receiptData: normalizeNonEmpty(body.receiptData),
      purchaseToken: resolvedPurchaseToken,
      signature: normalizeNonEmpty(body.signature),
    };

    const applied = await applyVerifiedIapPurchase({
      userId: sessionUser.id,
      platform,
      productId,
      transactionId: resolvedTransactionId,
      originalTransactionId: resolvedOriginalTransactionId,
      purchasedAt: resolvedPurchasedAt,
      rawPayload: resolvedRawPayload,
    });

    if (product.key === "memory_pass_monthly" && !applied.isSubscribed) {
      return NextResponse.json(
        {
          error: "유효한 구독 결제 내역을 확인하지 못했습니다. 스토어 결제를 다시 진행해 주세요.",
          code: "SUBSCRIPTION_NOT_ACTIVE_AFTER_VERIFY",
        },
        { status: 409 },
      );
    }

    // Google Play post-processing:
    // - Subscription: acknowledge
    // - Consumable INAPP: consume after grant (to allow repurchase)
    if (platform === "android" && resolvedPurchaseToken) {
      try {
        if (product.key === "memory_pass_monthly") {
          await acknowledgeGooglePlaySubscription({
            productId,
            purchaseToken: resolvedPurchaseToken,
          });
        } else if (product.type === "consumable") {
          await consumeGooglePlayProduct({
            productId,
            purchaseToken: resolvedPurchaseToken,
          });
        }
      } catch (postError) {
        console.warn("[api-iap-verify] android post process failed", {
          productKey: product.key,
          productId,
          transactionId: resolvedTransactionId,
          error: postError instanceof Error ? postError.message : String(postError),
        });
      }
    }

    if (!applied.idempotent) {
      await logAnalyticsEventSafe({
        userId: sessionUser.id,
        eventName: applied.productKey === "memory_pass_monthly" ? "subscription_started" : "token_purchased",
        properties: {
          platform,
          productKey: applied.productKey,
          productId,
          transactionId: resolvedTransactionId,
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
      const ownerMessage =
        platform === "android"
          ? "현재 Google Play 계정의 기억 패스는 다른 보고파 계정에 연결되어 있습니다."
          : "현재 Apple 계정의 기억 패스는 다른 보고파 계정에 연결되어 있습니다.";
      return NextResponse.json(
        { error: ownerMessage },
        { status: 409 },
      );
    }

    console.error("[api-iap-verify] failed", error);
    return NextResponse.json({ error: "결제 반영에 실패했습니다." }, { status: 500 });
  }
}
