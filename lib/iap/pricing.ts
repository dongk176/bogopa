import { IapProductKey } from "@/lib/iap/catalog";

const DEFAULT_PRICE_KRW: Record<IapProductKey, number> = {
  memory_pass_monthly: 3300,
  memory_pack_200: 2200,
  memory_pack_1000: 8800,
  memory_pack_20000: 139000,
  unlimited_chat_24h: 2200,
};

const ENV_PRICE_KEYS: Record<IapProductKey, string> = {
  memory_pass_monthly: "IAP_PRICE_MEMORY_PASS_MONTHLY_KRW",
  memory_pack_200: "IAP_PRICE_MEMORY_PACK_200_KRW",
  memory_pack_1000: "IAP_PRICE_MEMORY_PACK_1000_KRW",
  memory_pack_20000: "IAP_PRICE_MEMORY_PACK_20000_KRW",
  unlimited_chat_24h: "IAP_PRICE_UNLIMITED_CHAT_24H_KRW",
};

export const MEMORY_PASS_LIST_PRICE_KRW = 6600;

function readPositiveInt(value: string | undefined, fallback: number) {
  const raw = (value || "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getIapPriceKrwMap(): Record<IapProductKey, number> {
  return {
    memory_pass_monthly: readPositiveInt(
      process.env[ENV_PRICE_KEYS.memory_pass_monthly],
      DEFAULT_PRICE_KRW.memory_pass_monthly,
    ),
    memory_pack_200: readPositiveInt(
      process.env[ENV_PRICE_KEYS.memory_pack_200],
      DEFAULT_PRICE_KRW.memory_pack_200,
    ),
    memory_pack_1000: readPositiveInt(
      process.env[ENV_PRICE_KEYS.memory_pack_1000],
      DEFAULT_PRICE_KRW.memory_pack_1000,
    ),
    memory_pack_20000: readPositiveInt(
      process.env[ENV_PRICE_KEYS.memory_pack_20000],
      DEFAULT_PRICE_KRW.memory_pack_20000,
    ),
    unlimited_chat_24h: readPositiveInt(
      process.env[ENV_PRICE_KEYS.unlimited_chat_24h],
      DEFAULT_PRICE_KRW.unlimited_chat_24h,
    ),
  };
}

export function getIapPriceKrw(productKey: IapProductKey) {
  return getIapPriceKrwMap()[productKey];
}

