import OpenAI from "openai";

export const OPENAI_MODEL = process.env.OPENAI_BOGOPA_MODEL || "gpt-4.1-mini";
export const OPENAI_REPLY_MODEL = process.env.OPENAI_BOGOPA_REPLY_MODEL || OPENAI_MODEL;
export const OPENAI_LABEL_MODEL = process.env.OPENAI_BOGOPA_LABEL_MODEL || "gpt-4.1-nano";
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }
  return new OpenAI({ apiKey });
}
