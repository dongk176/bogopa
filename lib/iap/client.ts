import { Capacitor } from "@capacitor/core";
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

type NativeIapRestoreResult = {
  ok?: boolean;
  count?: number;
  restored?: NativeIapPurchaseResult[];
};

type NativeIapPlugin = {
  purchase(options: { productId: string; productKey?: string }): Promise<NativeIapPurchaseResult>;
  restore?: () => Promise<NativeIapRestoreResult>;
};

const NATIVE_IAP_PLUGIN_CANDIDATES = ["NativeIap", "NativeIAP", "BogopaIap"] as const;

function resolveRuntimePlatform(): IapPlatform {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    if (platform === "ios" || platform === "android") return platform;
  }
  return "ios";
}

function getNativeIapPlugin(): NativeIapPlugin | null {
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

function toTimestamp(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function preflightMemoryPassWithRestore(input: {
  nativeIap: NativeIapPlugin;
  platform: IapPlatform;
  storeProductId: string;
}) {
  if (typeof input.nativeIap.restore !== "function") return null;

  const restoreResult = await input.nativeIap.restore().catch(() => null);
  const restoredItems = Array.isArray(restoreResult?.restored) ? restoreResult!.restored! : [];
  if (restoredItems.length === 0) return null;

  const memoryPassItems = restoredItems
    .filter((item) => String(item.productId || "").trim() === input.storeProductId)
    .sort((a, b) => toTimestamp(b.purchasedAt) - toTimestamp(a.purchasedAt));

  if (memoryPassItems.length === 0) return null;

  const latest = memoryPassItems[0];
  const restoredTransactionId = String(
    latest.transactionId || latest.orderId || latest.purchaseToken || "",
  ).trim();
  if (!restoredTransactionId) return null;

  const originalTransactionId = String(latest.originalTransactionId || "").trim();
  const purchasedAt = String(latest.purchasedAt || new Date().toISOString());

  return applyPurchaseToServer({
    platform: input.platform,
    productId: input.storeProductId,
    transactionId: restoredTransactionId,
    originalTransactionId,
    purchasedAt,
    rawPayload: latest.rawPayload || {
      source: "native_storekit2_restore",
      productId: latest.productId,
      transactionId: latest.transactionId,
      originalTransactionId: latest.originalTransactionId,
      purchasedAt: latest.purchasedAt,
    },
  });
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
    const preflight = await preflightMemoryPassWithRestore({
      nativeIap,
      platform,
      storeProductId,
    });
    if (preflight) {
      return preflight;
    }
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
