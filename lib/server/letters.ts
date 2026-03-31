import { getDbPool } from "@/lib/server/db";
import type { PersonaRuntime } from "@/types/persona";

export type LetterKind = "morning" | "evening";

export type LetterPurpose =
  | "다정한 안부형"
  | "조용한 응원형"
  | "추억 회상형"
  | "오늘 버티기형"
  | "짧은 칭찬형"
  | "계절/날씨 기반형"
  | "특별한 날 회고형";

export type LetterRow = {
  id: string;
  user_id: string;
  persona_id: string;
  kind: LetterKind;
  purpose: LetterPurpose;
  title: string;
  preview: string;
  content: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
};

const LETTER_PURPOSES: LetterPurpose[] = [
  "다정한 안부형",
  "조용한 응원형",
  "추억 회상형",
  "오늘 버티기형",
  "짧은 칭찬형",
  "계절/날씨 기반형",
  "특별한 날 회고형",
];

const CREATE_LETTERS_TABLE_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  persona_id VARCHAR NOT NULL REFERENCES bogopa.personas(persona_id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('morning', 'evening')),
  purpose VARCHAR(32) NOT NULL,
  title VARCHAR(120) NOT NULL,
  preview VARCHAR(220) NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_letters_user_created
  ON bogopa.letters (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_letters_user_persona_created
  ON bogopa.letters (user_id, persona_id, created_at DESC);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureLettersTable() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_LETTERS_TABLE_SQL);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

function pickRandomDistinct<T>(source: T[], count: number): T[] {
  if (count <= 0 || source.length === 0) return [];
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function safeTrimList(values: unknown, limit: number, perItemMax = 120) {
  if (!Array.isArray(values)) return [] as string[];
  return values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => item.slice(0, perItemMax))
    .slice(0, limit);
}

function safeString(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getKstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const year = map.get("year") || "0000";
  const month = map.get("month") || "01";
  const day = map.get("day") || "01";
  const isoDate = `${year}-${month}-${day}`;

  const weekdayKo = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
  }).format(date);

  return {
    isoDate,
    year: Number(year),
    month: Number(month),
    day: Number(day),
    weekdayKo,
  };
}

export function buildLetterTitle(kind: LetterKind, date = new Date()) {
  const { month, day } = getKstDateParts(date);
  return `${month}월 ${day}일 ${kind === "morning" ? "아침 편지" : "밤 편지"}`;
}

export function pickRandomLetterPurpose() {
  return LETTER_PURPOSES[Math.floor(Math.random() * LETTER_PURPOSES.length)] || "다정한 안부형";
}

export async function getLetterById(userId: string, id: string): Promise<LetterRow | null> {
  await ensureLettersTable();
  const pool = getDbPool();
  const res = await pool.query(
    `
    SELECT id, user_id, persona_id, kind, purpose, title, preview, content, is_read, created_at, updated_at
    FROM bogopa.letters
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [id, userId],
  );
  return (res.rows[0] as LetterRow | undefined) || null;
}

export async function listLetters(userId: string, options?: { personaId?: string; take?: number }) {
  await ensureLettersTable();
  const pool = getDbPool();
  const take = Math.min(Math.max(options?.take || 40, 1), 200);

  if (options?.personaId) {
    const res = await pool.query(
      `
      SELECT id, user_id, persona_id, kind, purpose, title, preview, content, is_read, created_at, updated_at
      FROM bogopa.letters
      WHERE user_id = $1 AND persona_id = $2
      ORDER BY created_at DESC
      LIMIT $3
      `,
      [userId, options.personaId, take],
    );
    return res.rows as LetterRow[];
  }

  const res = await pool.query(
    `
    SELECT id, user_id, persona_id, kind, purpose, title, preview, content, is_read, created_at, updated_at
    FROM bogopa.letters
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [userId, take],
  );
  return res.rows as LetterRow[];
}

export async function markLetterAsRead(userId: string, id: string) {
  await ensureLettersTable();
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE bogopa.letters
    SET is_read = TRUE, updated_at = NOW()
    WHERE id = $1 AND user_id = $2
    `,
    [id, userId],
  );
}

export async function createLetter(input: {
  userId: string;
  personaId: string;
  kind: LetterKind;
  purpose: LetterPurpose;
  title: string;
  content: string;
}) {
  await ensureLettersTable();
  const pool = getDbPool();
  const preview = input.content.replace(/\s+/g, " ").trim().slice(0, 110);
  const res = await pool.query(
    `
    INSERT INTO bogopa.letters (user_id, persona_id, kind, purpose, title, preview, content, is_read)
    VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
    RETURNING id, user_id, persona_id, kind, purpose, title, preview, content, is_read, created_at, updated_at
    `,
    [input.userId, input.personaId, input.kind, input.purpose, input.title, preview, input.content],
  );
  return res.rows[0] as LetterRow;
}

export async function getRecentChatContext(userId: string, personaId: string) {
  const pool = getDbPool();

  const sessionRes = await pool.query(
    `
    SELECT id, memory_summary
    FROM bogopa.chat_sessions
    WHERE user_id = $1 AND persona_id = $2
    LIMIT 1
    `,
    [userId, personaId],
  );
  const session = sessionRes.rows[0] as { id: string; memory_summary: string | null } | undefined;
  if (!session?.id) {
    return { memorySummary: "", turns: [] as Array<{ role: "user" | "assistant"; content: string }> };
  }

  const msgRes = await pool.query(
    `
    SELECT role, content
    FROM bogopa.chat_messages
    WHERE session_id = $1
    ORDER BY created_at DESC
    LIMIT 4
    `,
    [session.id],
  );

  const turns = (msgRes.rows as Array<{ role: "user" | "assistant" | "system"; content: string }>)
    .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item) => ({ role: item.role as "user" | "assistant", content: item.content.trim().slice(0, 300) }))
    .reverse();

  return {
    memorySummary: (session.memory_summary || "").trim().slice(0, 900),
    turns,
  };
}

export async function getLettersCountByPersona(userId: string, personaId: string) {
  await ensureLettersTable();
  const pool = getDbPool();
  const res = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM bogopa.letters
    WHERE user_id = $1 AND persona_id = $2
    `,
    [userId, personaId],
  );
  return Number(res.rows[0]?.count || 0);
}

export function buildLetterRuntimeContext(runtimeData: PersonaRuntime, options: {
  letterKind: LetterKind;
  purpose: LetterPurpose;
  lettersCount: number;
}) {
  const displayName = safeString(runtimeData.displayName, 40) || "기억";
  const relation = safeString(runtimeData.relation, 40) || "소중한 사람";
  const alias = safeTrimList(runtimeData.addressing?.callsUserAs, 1, 30)[0] || "";
  const style = {
    politeness: safeString(runtimeData.style?.politeness, 40),
    replyTempo: safeString(runtimeData.style?.replyTempo, 40),
  };
  const empathyFirst = Boolean(runtimeData.behavior?.empathyFirst);

  const memories = safeTrimList(runtimeData.memories, 10, 80);
  const startIndex = memories.length > 0 ? options.lettersCount % memories.length : 0;
  const dailyMemories =
    memories.length <= 1
      ? memories
      : [memories[startIndex], memories[(startIndex + 1) % memories.length]].filter(Boolean);

  const frequentPhrases = safeTrimList(runtimeData.expressions?.frequentPhrases, 12, 40);
  const dailyFrequentPhrases = pickRandomDistinct(frequentPhrases, 2);

  const userProfile = runtimeData.userProfile
    ? {
        age: runtimeData.userProfile.age ?? null,
        mbti: safeString(runtimeData.userProfile.mbti, 8),
        interests: safeTrimList(runtimeData.userProfile.interests, 6, 20),
      }
    : null;

  const { isoDate, year, month, day, weekdayKo } = getKstDateParts();
  const letterType = options.letterKind === "morning" ? "하루 시작 편지" : "하루 마무리 편지";
  const timeContext =
    options.letterKind === "morning"
      ? "아침 8시 무렵, 하루를 시작하는 시간"
      : "밤 10시 무렵, 하루를 마무리하는 시간";

  return {
    fixed: {
      personaName: displayName,
      relation,
      style,
      empathyFirst,
      alias,
      deliveryContext: {
        letterType,
        date: {
          isoDate,
          year,
          month,
          day,
          weekdayKo,
        },
        timeContext,
      },
    },
    daily: {
      coreMemories: dailyMemories,
      frequentPhrases: dailyFrequentPhrases,
      purpose: options.purpose,
    },
    userProfile,
  };
}
