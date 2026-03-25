export const MEMORY_PASS_PRICE_KRW = 9900;
export const MEMORY_PASS_MONTHLY_GRANT = 1500;

export const MEMORY_COSTS = {
  chat: 5,
  personaCreate: 20,
} as const;

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
  memoryItemCharMax: 100,
  memoryItemMaxCount: 1,
  phraseItemCharMax: 10,
  phraseItemMaxCount: 1,
};

export const PAID_PLAN_LIMITS: PlanLimits = {
  summaryEditable: true,
  maxPersonas: 15,
  memoryItemCharMax: FREE_PLAN_LIMITS.memoryItemCharMax * 10,
  memoryItemMaxCount: FREE_PLAN_LIMITS.memoryItemMaxCount * 10,
  phraseItemCharMax: FREE_PLAN_LIMITS.phraseItemCharMax * 10,
  phraseItemMaxCount: FREE_PLAN_LIMITS.phraseItemMaxCount * 10,
};

export const MEMORY_PASS_REQUIRED_MESSAGE = "이 기능을 사용하려면 ‘기억 패스’를 등록해야 합니다.";

export function getPlanLimits(isSubscribed: boolean): PlanLimits {
  return isSubscribed ? PAID_PLAN_LIMITS : FREE_PLAN_LIMITS;
}
