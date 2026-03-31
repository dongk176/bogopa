export const MEMORY_PASS_PRICE_KRW = 9900;
export const MEMORY_PASS_MONTHLY_GRANT = 1500;

export const MEMORY_COSTS = {
  chat: 5,
  personaCreate: 20,
} as const;

export const MEMORY_ITEM_CHAR_LIMIT = 50;
export const FREQUENT_PHRASE_CHAR_LIMIT = 25;

export type PlanLimits = {
  summaryEditable: boolean;
  maxPersonas: number;
  memoryItemCharMax: number;
  memoryItemMaxCount: number;
  phraseItemCharMax: number;
  phraseItemMaxCount: number;
};

export const FREE_PLAN_LIMITS: PlanLimits = {
  summaryEditable: false,
  maxPersonas: 1,
  memoryItemCharMax: MEMORY_ITEM_CHAR_LIMIT,
  memoryItemMaxCount: 1,
  phraseItemCharMax: FREQUENT_PHRASE_CHAR_LIMIT,
  phraseItemMaxCount: 1,
};

export const PAID_PLAN_LIMITS: PlanLimits = {
  summaryEditable: true,
  maxPersonas: 15,
  memoryItemCharMax: MEMORY_ITEM_CHAR_LIMIT,
  memoryItemMaxCount: FREE_PLAN_LIMITS.memoryItemMaxCount * 10,
  phraseItemCharMax: FREQUENT_PHRASE_CHAR_LIMIT,
  phraseItemMaxCount: FREE_PLAN_LIMITS.phraseItemMaxCount * 10,
};

export const MEMORY_PASS_REQUIRED_MESSAGE = "이 기능을 사용하려면 ‘기억 패스’를 등록해야 합니다.";

export function getPlanLimits(isSubscribed: boolean): PlanLimits {
  return isSubscribed ? PAID_PLAN_LIMITS : FREE_PLAN_LIMITS;
}
