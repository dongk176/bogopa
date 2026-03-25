import { getDbPool } from "./db";
import { PersonaRuntime } from "@/types/persona";

const CREATE_CHAT_TABLES_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  persona_id VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  avatar_url TEXT,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bogopa.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  persona_id VARCHAR REFERENCES bogopa.personas(persona_id) ON DELETE CASCADE,
  memory_summary TEXT DEFAULT '',
  unsummarized_turns JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_turn_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, persona_id)
);

CREATE TABLE IF NOT EXISTS bogopa.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES bogopa.chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureChatTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_CHAT_TABLES_SQL);
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

export async function savePersonaToDb(
  userId: string,
  personaId: string,
  name: string,
  avatarUrl: string | null,
  analysis: unknown,
  runtime: PersonaRuntime
) {
  await ensureChatTables();
  const pool = getDbPool();
  await pool.query(
    `
    INSERT INTO bogopa.personas (user_id, persona_id, name, avatar_url, analysis, runtime)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    ON CONFLICT (persona_id)
    DO UPDATE SET 
      name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url,
      analysis = EXCLUDED.analysis,
      runtime = EXCLUDED.runtime,
      updated_at = NOW()
    `,
    [userId, personaId, name, avatarUrl, JSON.stringify(analysis), JSON.stringify(runtime)]
  );
}

export async function getPersonasForUser(userId: string) {
  await ensureChatTables();
  const pool = getDbPool();
  // Join with sessions to get the last message and summary if available
  const res = await pool.query(
    `SELECT 
      p.*, 
      s.id as session_id,
      s.memory_summary, 
      s.user_turn_count,
      s.updated_at as session_updated_at,
      (SELECT m.content FROM bogopa.chat_messages m WHERE m.session_id = s.id ORDER BY m.created_at DESC LIMIT 1) as last_message_content
    FROM bogopa.personas p
    LEFT JOIN bogopa.chat_sessions s ON p.persona_id = s.persona_id AND s.user_id = p.user_id
    WHERE p.user_id = $1
    ORDER BY GREATEST(p.updated_at, COALESCE(s.updated_at, '1970-01-01')) DESC`,
    [userId]
  );
  return res.rows;
}

export async function getPersonaById(personaId: string, userId: string) {
  await ensureChatTables();
  const pool = getDbPool();
  const res = await pool.query(
    `SELECT * FROM bogopa.personas WHERE persona_id = $1 AND user_id = $2`,
    [personaId, userId]
  );
  return res.rows[0];
}

export async function countPersonasForUser(userId: string) {
  await ensureChatTables();
  const pool = getDbPool();
  const res = await pool.query(
    `SELECT COUNT(*)::int AS count FROM bogopa.personas WHERE user_id = $1`,
    [userId],
  );
  return Number(res.rows[0]?.count || 0);
}

export async function getOrCreateSession(userId: string, personaId: string) {
  await ensureChatTables();
  const pool = getDbPool();
  
  const existing = await pool.query(
    `SELECT * FROM bogopa.chat_sessions WHERE user_id = $1 AND persona_id = $2`,
    [userId, personaId]
  );
  
  if (existing.rows.length > 0) return existing.rows[0];
  
  const created = await pool.query(
    `
    INSERT INTO bogopa.chat_sessions (user_id, persona_id)
    VALUES ($1, $2)
    RETURNING *
    `,
    [userId, personaId]
  );
  return created.rows[0];
}

export async function saveMessageToDb(sessionId: string, role: string, content: string) {
  await ensureChatTables();
  const pool = getDbPool();
  
  const res = await pool.query(
    `
    INSERT INTO bogopa.chat_messages (session_id, role, content)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [sessionId, role, content]
  );
  
  await pool.query(
    `UPDATE bogopa.chat_sessions SET updated_at = NOW() WHERE id = $1`,
    [sessionId]
  );
  
  return res.rows[0];
}

export async function saveAssistantGreetingToDb(sessionId: string, content: string) {
  await ensureChatTables();
  const pool = getDbPool();
  
  // Use a conditional insert to prevent double greetings during race conditions
  const res = await pool.query(
    `
    INSERT INTO bogopa.chat_messages (session_id, role, content)
    SELECT $1, 'assistant', $2
    WHERE NOT EXISTS (
      SELECT 1 FROM bogopa.chat_messages 
      WHERE session_id = $1 AND role = 'assistant' LIMIT 1
    )
    RETURNING *
    `,
    [sessionId, content]
  );
  
  if (res.rows.length > 0) {
    await pool.query(
      `UPDATE bogopa.chat_sessions SET updated_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  }
  
  return res.rows[0] || null;
}

export async function getMessagesForSession(sessionId: string) {
  await ensureChatTables();
  const pool = getDbPool();
  const res = await pool.query(
    `SELECT id, role, content, created_at FROM bogopa.chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return res.rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at
  }));
}

export async function updateSessionState(
  sessionId: string,
  memorySummary: string,
  unsummarizedTurns: any[],
  userTurnCount: number
) {
  await ensureChatTables();
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE bogopa.chat_sessions
    SET memory_summary = $2, unsummarized_turns = $3::jsonb, user_turn_count = $4, updated_at = NOW()
    WHERE id = $1
    `,
    [sessionId, memorySummary, JSON.stringify(unsummarizedTurns), userTurnCount]
  );
}


export async function clearSessionMessages(sessionId: string) {
  await ensureChatTables();
  const pool = getDbPool();
  await pool.query(
    "DELETE FROM bogopa.chat_messages WHERE session_id = $1",
    [sessionId]
  );
  await pool.query(
    "UPDATE bogopa.chat_sessions SET memory_summary = '', unsummarized_turns = '[]'::jsonb, user_turn_count = 0, updated_at = NOW() WHERE id = $1",
    [sessionId]
  );
}
