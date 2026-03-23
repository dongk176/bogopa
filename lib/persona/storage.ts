import { PersonaAnalysis, PersonaAnalyzeInput, PersonaRuntime, PrimaryGoal, Gender } from "@/types/persona";

const STEP1_KEY = "bogopa_profile_step1";
const STEP2_KEY = "bogopa_profile_step2";
const STEP3_KEY = "bogopa_profile_step3";
const STEP4_KEY = "bogopa_profile_step4";

export const PERSONA_ANALYSIS_STORAGE_KEY = "blueme_persona_analysis";
export const PERSONA_RUNTIME_STORAGE_KEY = "blueme_persona_runtime";

type Step1Raw = { name?: string; gender?: "Male" | "Female" | string };
type Step2Raw = { goal?: string; customGoal?: string };
type Step3Raw = {
  personaName?: string;
  relationship?: string;
  personaGender?: Gender | "Male" | "Female";
  personaImageUrl?: string;
  userNickname?: string;
  personaOccupation?: string;
  memo?: string;
};
type Step4Raw = {
  pastedConversation?: string;
  uploadedFileName?: string;
  useManualSettings?: boolean;
  frequentPhrases?: string;
  nickname?: string;
  toneStyle?: string;
  emotionDepth?: string;
  emojiStyle?: string;
};

function readStep3AvatarUrl(): string | null {
  if (typeof window === "undefined") return null;
  const step3 = safeParse<Step3Raw>(window.localStorage.getItem(STEP3_KEY));
  const avatar = step3?.personaImageUrl?.trim();
  return avatar ? avatar : null;
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toGender(raw?: string): Gender {
  if (!raw) return "female";
  const normalized = raw.toLowerCase();
  if (normalized === "male") return "male";
  return "female";
}

function toGoal(raw?: string): PrimaryGoal {
  if (raw === "comfort" || raw === "memory" || raw === "custom") return raw;
  if (raw === "unfinished" || raw === "unfinished_words") return "unfinished_words";
  if (raw === "daily" || raw === "casual_talk") return "casual_talk";
  return "custom";
}

function splitPhrases(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,|/]/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function inferPersonaGender(relation: string, fallbackUserGender: Gender): Gender {
  const rel = relation.replace(/\s/g, "");
  if (/(엄마|누나|언니|여동생)/.test(rel)) return "female";
  if (/(아빠|형|오빠|남동생)/.test(rel)) return "male";
  return fallbackUserGender;
}

function inferRuntimeGender(relation: string): Gender {
  const rel = relation.replace(/\s/g, "");
  if (/(엄마|누나|언니|여동생|아내|와이프|부인|여친)/.test(rel)) return "female";
  if (/(아빠|형|오빠|남동생|남편|남친)/.test(rel)) return "male";
  return "female";
}

function normalizeAddressAlias(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 1) {
    if (trimmed.endsWith("야") || trimmed.endsWith("아")) return trimmed.slice(0, -1);
    if (trimmed.endsWith("님") || trimmed.endsWith("씨")) return trimmed.slice(0, -1);
  }
  return trimmed;
}

export function loadStepInputsFromLocalStorage(): PersonaAnalyzeInput | null {
  if (typeof window === "undefined") return null;

  const step1 = safeParse<Step1Raw>(window.localStorage.getItem(STEP1_KEY));
  const step2 = safeParse<Step2Raw>(window.localStorage.getItem(STEP2_KEY));
  const step3 = safeParse<Step3Raw>(window.localStorage.getItem(STEP3_KEY));
  const step4 = safeParse<Step4Raw>(window.localStorage.getItem(STEP4_KEY));

  if (!step1 || !step2 || !step3 || !step4) return null;

  const userGender = toGender(step1.gender);
  const relation = (step3.relationship || "").trim();

  const personaGender =
    step3.personaGender && (step3.personaGender === "male" || step3.personaGender === "female")
      ? step3.personaGender
      : step3.personaGender === "Male" || step3.personaGender === "Female"
        ? toGender(step3.personaGender)
        : inferPersonaGender(relation, userGender);

  return {
    step1: {
      userName: (step1.name || "").trim(),
      userGender,
    },
    step2: {
      primaryGoal: toGoal(step2.goal),
      customGoalText: (step2.customGoal || "").trim(),
    },
    step3: {
      personaName: (step3.personaName || "").trim(),
      relation,
      personaGender,
      avatarUrl: step3.personaImageUrl || null,
      userNickname: (step3.userNickname || step3.memo || "").trim(),
      personaOccupation: (step3.personaOccupation || "").trim(),
    },
    step4: {
      conversationText: (step4.pastedConversation || "").trim(),
      uploadedFileName: step4.uploadedFileName || null,
      manualMode: Boolean(step4.useManualSettings),
      manualSettings: {
        frequentPhrases: splitPhrases(step4.frequentPhrases),
        nickname: (step4.nickname || "").trim(),
        tone: (step4.toneStyle || "").trim(),
        mood: (step4.emotionDepth || "").trim(),
        emojiStyle: (step4.emojiStyle || "").trim(),
      },
    },
  };
}

export function savePersonaAnalysis(analysis: PersonaAnalysis) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERSONA_ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
  if (analysis.personaId) {
    window.localStorage.setItem(`${PERSONA_ANALYSIS_STORAGE_KEY}_${analysis.personaId}`, JSON.stringify(analysis));
  }
}

export function loadPersonaAnalysis(id?: string): PersonaAnalysis | null {
  if (typeof window === "undefined") return null;
  const key = id ? `${PERSONA_ANALYSIS_STORAGE_KEY}_${id}` : PERSONA_ANALYSIS_STORAGE_KEY;
  const parsed = safeParse<PersonaAnalysis>(window.localStorage.getItem(key));
  if (!parsed) return null;

  if (!parsed.personaInput.avatarUrl) {
    const fallbackAvatar = readStep3AvatarUrl();
    if (fallbackAvatar) {
      return {
        ...parsed,
        personaInput: {
          ...parsed.personaInput,
          avatarUrl: fallbackAvatar,
        },
      };
    }
  }

  return parsed;
}

export function savePersonaRuntime(runtime: PersonaRuntime) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERSONA_RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
  if (runtime.personaId) {
    window.localStorage.setItem(`${PERSONA_RUNTIME_STORAGE_KEY}_${runtime.personaId}`, JSON.stringify(runtime));
  }
}

export function loadPersonaRuntime(id?: string): PersonaRuntime | null {
  if (typeof window === "undefined") return null;
  const key = id ? `${PERSONA_RUNTIME_STORAGE_KEY}_${id}` : PERSONA_RUNTIME_STORAGE_KEY;
  const parsed = safeParse<PersonaRuntime>(window.localStorage.getItem(key));
  if (!parsed) return null;

  const normalized: PersonaRuntime = {
    ...parsed,
    gender: parsed.gender === "male" || parsed.gender === "female" ? parsed.gender : inferRuntimeGender(parsed.relation || ""),
    addressing: {
      callsUserAs: (parsed.addressing?.callsUserAs || []).map((item) => normalizeAddressAlias(item)).filter(Boolean),
      userCallsPersonaAs: parsed.addressing?.userCallsPersonaAs || [],
    },
    personaMeta: {
      occupation: parsed.personaMeta?.occupation || "",
      workAttitudeSummary: parsed.personaMeta?.workAttitudeSummary || "직업 관련 데이터가 아직 충분하지 않아요.",
      workTendencyTags: parsed.personaMeta?.workTendencyTags || [],
      selfTalkStyle: parsed.personaMeta?.selfTalkStyle || "담백하게 하루 근황을 공유하는 편",
    },
  };

  return normalized;
}

export function clearPersonaArtifacts(id?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PERSONA_ANALYSIS_STORAGE_KEY);
  window.localStorage.removeItem(PERSONA_RUNTIME_STORAGE_KEY);
  if (id) {
    window.localStorage.removeItem(`${PERSONA_ANALYSIS_STORAGE_KEY}_${id}`);
    window.localStorage.removeItem(`${PERSONA_RUNTIME_STORAGE_KEY}_${id}`);
  }
}
