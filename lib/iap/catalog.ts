export type IapPlatform = "ios" | "android";

export type IapProductKey =
  | "memory_pass_monthly"
  | "memory_pack_200"
  | "memory_pack_1000"
  | "memory_pack_20000"
  | "unlimited_chat_24h";

export type IapProductType = "subscription" | "consumable" | "non_consumable";

export type IapProduct = {
  key: IapProductKey;
  type: IapProductType;
  title: string;
  memoryCredit: number;
  unlimitedHours: number;
  androidProductId: string;
  iosProductId: string;
};

const DEFAULT_PRODUCT_IDS: Record<IapProductKey, { ios: string; android: string }> = {
  memory_pass_monthly: {
    ios: "co.kr.bogopa.pass.monthly",
    android: "co.kr.bogopa.pass.m.v2",
  },
  memory_pack_200: {
    ios: "co.kr.bogopa.app.memory.200",
    android: "co.kr.bogopa.app.memory.200.v2",
  },
  memory_pack_1000: {
    ios: "co.kr.bogopa.app.memory.1000",
    android: "co.kr.bogopa.app.memory.1000",
  },
  memory_pack_20000: {
    ios: "co.kr.bogopa.app.memory.20000",
    android: "co.kr.bogopa.app.memory.20000",
  },
  unlimited_chat_24h: {
    ios: "co.kr.bogopa.unlimited.24h",
    android: "co.kr.bogopa.unlimited.24h",
  },
};

const LEGACY_ANDROID_PRODUCT_IDS: Partial<Record<IapProductKey, string[]>> = {
  memory_pass_monthly: ["co.kr.bogopa.pass.monthly"],
  memory_pack_200: ["co.kr.bogopa.app.memory.200"],
};

function readEnvId(name: string, fallback: string) {
  const raw = process.env[name];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || fallback;
}

export function getIapCatalog(): IapProduct[] {
  return [
    {
      key: "memory_pass_monthly",
      type: "subscription",
      title: "기억 패스(월)",
      memoryCredit: 0,
      unlimitedHours: 0,
      iosProductId: readEnvId("IAP_IOS_MEMORY_PASS_MONTHLY_ID", DEFAULT_PRODUCT_IDS.memory_pass_monthly.ios),
      androidProductId: readEnvId("IAP_ANDROID_MEMORY_PASS_MONTHLY_ID", DEFAULT_PRODUCT_IDS.memory_pass_monthly.android),
    },
    {
      key: "memory_pack_200",
      type: "consumable",
      title: "200기억",
      memoryCredit: 200,
      unlimitedHours: 0,
      iosProductId: readEnvId("IAP_IOS_MEMORY_PACK_200_ID", DEFAULT_PRODUCT_IDS.memory_pack_200.ios),
      androidProductId: readEnvId("IAP_ANDROID_MEMORY_PACK_200_ID", DEFAULT_PRODUCT_IDS.memory_pack_200.android),
    },
    {
      key: "memory_pack_1000",
      type: "consumable",
      title: "1,000기억",
      memoryCredit: 1000,
      unlimitedHours: 0,
      iosProductId: readEnvId("IAP_IOS_MEMORY_PACK_1000_ID", DEFAULT_PRODUCT_IDS.memory_pack_1000.ios),
      androidProductId: readEnvId("IAP_ANDROID_MEMORY_PACK_1000_ID", DEFAULT_PRODUCT_IDS.memory_pack_1000.android),
    },
    {
      key: "memory_pack_20000",
      type: "consumable",
      title: "20,000기억",
      memoryCredit: 20000,
      unlimitedHours: 0,
      iosProductId: readEnvId("IAP_IOS_MEMORY_PACK_20000_ID", DEFAULT_PRODUCT_IDS.memory_pack_20000.ios),
      androidProductId: readEnvId("IAP_ANDROID_MEMORY_PACK_20000_ID", DEFAULT_PRODUCT_IDS.memory_pack_20000.android),
    },
    {
      key: "unlimited_chat_24h",
      type: "consumable",
      title: "무제한 대화 이용권(24시간)",
      memoryCredit: 0,
      unlimitedHours: 24,
      iosProductId: readEnvId("IAP_IOS_UNLIMITED_24H_ID", DEFAULT_PRODUCT_IDS.unlimited_chat_24h.ios),
      androidProductId: readEnvId("IAP_ANDROID_UNLIMITED_24H_ID", DEFAULT_PRODUCT_IDS.unlimited_chat_24h.android),
    },
  ];
}

export function findIapProductByStoreId(input: { platform: IapPlatform; productId: string }) {
  const normalizedProductId = input.productId.trim();
  if (!normalizedProductId) return null;
  const catalog = getIapCatalog();
  return (
    catalog.find((item) =>
      input.platform === "ios"
        ? item.iosProductId === normalizedProductId
        : item.androidProductId === normalizedProductId ||
          (LEGACY_ANDROID_PRODUCT_IDS[item.key] || []).includes(normalizedProductId),
    ) || null
  );
}
