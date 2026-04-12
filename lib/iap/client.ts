import { Capacitor, registerPlugin } from "@capacitor/core";
import type { IapPlatform, IapProductKey } from "@/lib/iap/catalog";

type CatalogItem = {
  key: IapProductKey;
  storeProductId: string;
};

type NativeIapPurchaseResult = {
  productId?: string;
  transactionId?: string;
  orderId?: string;
  purchaseToken?: string;
  originalTransactionId?: string;
  purchasedAt?: string;
  rawPayload?: Record<string, unknown>;
};

type NativeIapPlugin = {
  purchase(options: { productId: string; productKey?: string }): Promise<NativeIapPurchaseResult>;
  restore?: () => Promise<{
    ok?: boolean;
    count?: number;
    restored?: NativeIapPurchaseResult[];
  }>;
};

const NATIVE_IAP_PLUGIN_CANDIDATES = ["NativeIap", "NativeIAP", "BogopaIap"] as const;
const MEMORY_PASS_OWNERSHIP_CONFLICT_CODE = "IAP_MEMORY_PASS_OWNERSHIP_CONFLICT";

const REGISTERED_NATIVE_IAP_PLUGINS = {
  NativeIap: registerPlugin<NativeIapPlugin>("NativeIap"),
  NativeIAP: registerPlugin<NativeIapPlugin>("NativeIAP"),
  BogopaIap: registerPlugin<NativeIapPlugin>("BogopaIap"),
} as const;

export class MemoryPassOwnershipConflictError extends Error {
  readonly code = MEMORY_PASS_OWNERSHIP_CONFLICT_CODE;
  constructor(message: string) {
    super(message);
    this.name = "MemoryPassOwnershipConflictError";
  }
}

export function isMemoryPassOwnershipConflictError(error: unknown): error is MemoryPassOwnershipConflictError {
  return (
    error instanceof MemoryPassOwnershipConflictError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === MEMORY_PASS_OWNERSHIP_CONFLICT_CODE)
  );
}

function resolveRuntimePlatform(): IapPlatform {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    if (platform === "ios" || platform === "android") return platform;
  }
  return "ios";
}

function getNativeIapPlugin(): NativeIapPlugin | null {
  for (const key of NATIVE_IAP_PLUGIN_CANDIDATES) {
    if (!Capacitor.isPluginAvailable(key)) continue;
    const candidate = REGISTERED_NATIVE_IAP_PLUGINS[key];
    if (candidate && typeof candidate.purchase === "function") return candidate;
  }

  if (typeof window === "undefined") return null;
  const pluginMap = ((window as any).Capacitor?.Plugins ?? {}) as Record<string, unknown>;
  for (const key of NATIVE_IAP_PLUGIN_CANDIDATES) {
    const candidate = pluginMap[key] as NativeIapPlugin | undefined;
    if (candidate && typeof candidate.purchase === "function") {
      return candidate;
    }
  }
  return null;
}

async function resolveStoreProductId(platform: IapPlatform, productKey: IapProductKey) {
  const response = await fetch(`/api/iap/catalog?platform=${platform}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("상품 정보를 불러오지 못했습니다.");
  }
  const data = await response.json().catch(() => ({}));
  const products = Array.isArray(data?.products) ? (data.products as CatalogItem[]) : [];
  const target = products.find((item) => item.key === productKey);
  const storeProductId = String(target?.storeProductId || "").trim();
  if (!storeProductId) {
    throw new Error(`스토어에서 상품을 찾을 수 없습니다. productId=${productKey}`);
  }
  return storeProductId;
}

async function applyPurchaseToServer(input: {
  platform: IapPlatform;
  productId: string;
  transactionId: string;
  originalTransactionId?: string;
  purchasedAt?: string;
  rawPayload?: Record<string, unknown>;
}) {
  const response = await fetch("/api/iap/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || "결제 반영에 실패했습니다."));
  }
  return data as {
    memoryBalance?: number;
    isSubscribed?: boolean;
    isUnlimitedChatActive?: boolean;
    unlimitedChatExpiresAt?: string | null;
  };
}

function parseOptionalTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const ts = Date.parse(value.trim());
  if (!Number.isFinite(ts)) return null;
  return ts;
}

function isLikelyActiveSubscriptionPayload(payload: NativeIapPurchaseResult) {
  const raw = (payload.rawPayload || {}) as Record<string, unknown>;
  const revocationTs = parseOptionalTimestamp(raw.revocationDate);
  if (typeof revocationTs === "number" && revocationTs <= Date.now()) return false;

  const expiresTs =
    parseOptionalTimestamp(raw.expirationDate) ??
    parseOptionalTimestamp(raw.expiresDate) ??
    parseOptionalTimestamp(raw.expiresAt);
  if (typeof expiresTs === "number") return expiresTs > Date.now();

  return true;
}

async function preflightMemoryPassOwnership(input: {
  platform: IapPlatform;
  storeProductId: string;
  nativeIap: NativeIapPlugin;
}) {
  if (input.platform !== "ios") return;
  if (typeof input.nativeIap.restore !== "function") return;

  let restored: NativeIapPurchaseResult[] = [];
  try {
    const restoredResult = await input.nativeIap.restore();
    restored = Array.isArray(restoredResult?.restored) ? restoredResult.restored : [];
  } catch {
    // Preflight is best-effort. If restore fails, continue purchase flow.
    return;
  }

  const target = restored.find((item) => {
    const productId = String(item.productId || item.rawPayload?.productId || "").trim();
    if (!productId || productId !== input.storeProductId) return false;
    return isLikelyActiveSubscriptionPayload(item);
  });
  if (!target) return;

  const originalTransactionId = String(
    target.originalTransactionId || target.rawPayload?.originalTransactionId || "",
  ).trim();
  if (!originalTransactionId) return;

  const response = await fetch("/api/iap/memory-pass/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: input.platform,
      productId: input.storeProductId,
      originalTransactionId,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 409 || data?.code === "MEMORY_PASS_OWNED_BY_OTHER_ACTIVE") {
    const message = String(
      data?.error || "현재 Apple 계정의 기억 패스는 다른 보고파 아이디에 연결되어 있습니다.",
    );
    throw new MemoryPassOwnershipConflictError(message);
  }
}

export async function purchaseIapProduct(productKey: IapProductKey) {
  const platform = resolveRuntimePlatform();
  const storeProductId = await resolveStoreProductId(platform, productKey);
  const isNativeRuntime = Capacitor.isNativePlatform();
  const nativeIap = getNativeIapPlugin();

  if (!nativeIap) {
    if (isNativeRuntime) {
      throw new Error("네이티브 결제 모듈을 찾지 못했습니다. 앱을 다시 설치한 뒤 시도해주세요.");
    }
    throw new Error("결제는 네이티브 앱에서만 가능합니다.");
  }

  if (productKey === "memory_pass_monthly") {
    await preflightMemoryPassOwnership({
      platform,
      storeProductId,
      nativeIap,
    });
  }

  const purchaseResult = await nativeIap.purchase({
    productId: storeProductId,
    productKey,
  });

  const resolvedTransactionId = String(
    purchaseResult.transactionId || purchaseResult.orderId || purchaseResult.purchaseToken || "",
  ).trim();
  if (!resolvedTransactionId) {
    throw new Error("거래 정보를 확인하지 못했습니다.");
  }

  const originalTransactionId = String(purchaseResult.originalTransactionId || "").trim();
  const purchasedAt = String(purchaseResult.purchasedAt || new Date().toISOString());
  const rawPayload = purchaseResult.rawPayload || purchaseResult;

  return applyPurchaseToServer({
    platform,
    productId: storeProductId,
    transactionId: resolvedTransactionId,
    originalTransactionId,
    purchasedAt,
    rawPayload,
  });
}

export async function restoreIapPurchases(): Promise<void> {
  const platform = resolveRuntimePlatform();
  if (!platform) return;

  const nativeIap = getNativeIapPlugin();
  if (!nativeIap || typeof nativeIap.restore !== "function") {
    throw new Error("결제 내역 복원 기능을 지원하지 않는 환경입니다.");
  }

  const result = await nativeIap.restore();
  if (!result || !Array.isArray(result.restored) || result.restored.length === 0) {
    throw new Error("복조 가능한 결제 내역이 없습니다.");
  }

  let successCount = 0;
  for (const item of result.restored) {
    const storeProductId = item.productId;
    const resolvedTransactionId = String(item.transactionId || item.orderId || item.purchaseToken || "").trim();
    if (!storeProductId || !resolvedTransactionId) continue;

    try {
      await applyPurchaseToServer({
        platform,
        productId: storeProductId,
        transactionId: resolvedTransactionId,
        originalTransactionId: item.originalTransactionId,
        purchasedAt: item.purchasedAt || new Date().toISOString(),
        rawPayload: item.rawPayload || item,
      });
      successCount++;
    } catch (err: any) {
      // 본인 소유가 아니거나(Conflict) 이미 처리된 에러 등이 발생할 수 있음
      if (err instanceof Error && err.message.includes("이미 다른 계정에서")) continue;
      if (err instanceof Error && err.message.includes("연결되어 있습니다")) continue;
      console.warn("[iap-restore] item sync failed", err);
    }
  }

  if (successCount === 0) {
    throw new Error("새로 복원된 유효한 결제 내역이 없습니다.");
  }
}
