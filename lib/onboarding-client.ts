const SESSION_STORAGE_KEY = "bogopa_onboarding_session_id";
const STEP_DRAFT_KEYS = [
  "bogopa_profile_step2",
  "bogopa_profile_step3",
  "bogopa_profile_step4",
] as const;

function createFallbackId() {
  return `bogopa-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateOnboardingSessionId() {
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const nextId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : createFallbackId();
  window.localStorage.setItem(SESSION_STORAGE_KEY, nextId);
  return nextId;
}

export async function persistOnboardingStep(
  step: 1 | 2 | 3 | 4,
  data: unknown,
  options?: { forceNewSession?: boolean },
) {
  if (options?.forceNewSession) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  const sessionId = getOrCreateOnboardingSessionId();

  const response = await fetch("/api/onboarding/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      step,
      data,
    }),
  });

  if (!response.ok) {
    let message = "서버 저장에 실패했습니다.";

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // noop
    }

    throw new Error(message);
  }

  return sessionId;
}

export function clearOnboardingDraft(options?: { clearSession?: boolean }) {
  if (typeof window === "undefined") return;

  STEP_DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));

  if (options?.clearSession !== false) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}
