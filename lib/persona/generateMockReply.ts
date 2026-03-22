import { PersonaRuntime } from "@/types/persona";

function pick<T>(items: T[]): T | null {
  if (!items || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

type RelationTone = "parent" | "partner" | "sibling" | "default";

function detectRelationTone(relation: string): RelationTone {
  const normalized = relation.replace(/\s/g, "");
  if (/(엄마|아빠|어머니|아버지|부모|어무니|아부지)/.test(normalized)) return "parent";
  if (/(연인|배우자|남편|아내|와이프|부인|남친|여친)/.test(normalized)) return "partner";
  if (/(형|오빠|누나|언니|동생|형제|자매)/.test(normalized)) return "sibling";
  return "default";
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

function normalizeReactionToken(token: string) {
  if (/ㅋ/.test(token) || /크크/.test(token)) return "ㅋㅋ";
  if (/ㅎ/.test(token) || /하하|헤헤/.test(token)) return "ㅎㅎ";
  if (/ㅠ|ㅜ/.test(token)) return "ㅠㅠ";
  return "";
}

function relationSentence(relationTone: RelationTone, empathyFirst: boolean, excerpt: string) {
  if (relationTone === "parent") {
    if (empathyFirst) return excerpt ? `"${excerpt}" 마음이 크게 남았겠구나.` : "지금 마음이 무거웠겠구나.";
    return excerpt ? `"${excerpt}" 이야기 잘 들었어.` : "이야기 잘 들었어.";
  }

  if (relationTone === "partner") {
    if (empathyFirst) return excerpt ? `"${excerpt}"라는 마음, 충분히 이해돼.` : "지금 마음, 충분히 이해돼.";
    return excerpt ? `"${excerpt}" 이야기 고마워.` : "이야기 고마워.";
  }

  if (relationTone === "sibling") {
    if (empathyFirst) return excerpt ? `"${excerpt}" 들으니까 네 상태가 느껴져.` : "지금 네 상태가 느껴져.";
    return excerpt ? `"${excerpt}" 얘기 들었어.` : "얘기 들었어.";
  }

  if (empathyFirst) return excerpt ? `"${excerpt}"라고 느꼈구나.` : "네 마음을 잘 전해줬어.";
  return excerpt ? `"${excerpt}" 이야기 확인했어.` : "이야기 확인했어.";
}

function goalSentence(runtime: PersonaRuntime) {
  const tone = runtime.style.tone[0] || "차분한";
  if (runtime.goal === "comfort") return `${tone} 톤으로 감정 정리부터 같이 해볼게.`;
  if (runtime.goal === "memory") return `${tone} 톤으로 기억을 무리 없이 이어가볼게.`;
  if (runtime.goal === "unfinished_words") return `${tone} 톤으로 못다 한 마음을 정리해볼게.`;
  if (runtime.goal === "casual_talk") return `${tone} 톤으로 일상 대화를 자연스럽게 이어갈게.`;
  return `${tone} 톤으로 네 흐름에 맞춰 이어갈게.`;
}

function selfTalkSentence(runtime: PersonaRuntime) {
  const occupation = runtime.personaMeta?.occupation?.trim() || "";
  const workStyle = runtime.personaMeta?.selfTalkStyle?.trim() || "";
  if (!occupation) return "";
  if (workStyle) return workStyle;
  return `오늘 ${occupation} 일은 무난하게 지나갔어.`;
}

function cleanUserExcerpt(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 18);
}

export function generateMockReply(runtime: PersonaRuntime, userMessage: string): string {
  const relationTone = detectRelationTone(runtime.relation);
  const alias = normalizeAddressAlias(runtime.addressing.callsUserAs[0] || "");
  const excerpt = cleanUserExcerpt(userMessage);

  const first = relationSentence(relationTone, runtime.behavior.empathyFirst, excerpt);
  const second = goalSentence(runtime);
  const third = Math.random() > 0.62 ? selfTalkSentence(runtime) : "";

  const reactionRaw = pick(runtime.expressions.laughterPatterns) || "";
  const reaction = normalizeReactionToken(reactionRaw);
  const shouldAttachReaction = relationTone !== "parent" && reaction && Math.random() > 0.86;

  const head = alias && Math.random() > 0.5 ? `${alias}, ` : "";
  const merged = [first, second, third].filter(Boolean).join(" ");
  const withHead = `${head}${merged}`.trim();
  if (!shouldAttachReaction) return withHead;
  return `${withHead} ${reaction}`.trim();
}
