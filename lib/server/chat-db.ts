import { getDbPool } from "./db";
import { PersonaRuntime } from "@/types/persona";
import { inferAvatarStorage } from "@/lib/avatar-storage";
import type { SaveTurnAnalysisInput } from "@/lib/chat/turn-analysis/types";
import {
  STORED_ANALYSIS_CONFIDENCE,
  STORED_ANALYSIS_RISK_LEVEL,
} from "@/lib/chat/turn-analysis/constants";

const CREATE_CHAT_TABLES_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  persona_id VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  avatar_url TEXT,
  avatar_source VARCHAR(24),
  avatar_key TEXT,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bogopa.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  persona_id VARCHAR REFERENCES bogopa.personas(persona_id) ON DELETE CASCADE,
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'bogopa'
      AND table_name = 'chat_turn_judgments'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'bogopa'
      AND table_name = 'chat_turn_judgments_legacy'
  ) THEN
    ALTER TABLE bogopa.chat_turn_judgments RENAME TO chat_turn_judgments_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bogopa.chat_turn_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES bogopa.chat_sessions(id) ON DELETE CASCADE,
  user_message_id UUID NOT NULL REFERENCES bogopa.chat_messages(id) ON DELETE CASCADE,
  assistant_message_id UUID REFERENCES bogopa.chat_messages(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  relation_group TEXT,
  taxonomy_version TEXT NOT NULL DEFAULT 'v1.0',
  topic TEXT,
  topic_shift TEXT NOT NULL,
  primary_intent TEXT NOT NULL,
  emotion TEXT NOT NULL,
  intensity INTEGER NOT NULL,
  desired_response_mode TEXT,
  unfinished_point TEXT,
  text_quality TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  raw_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_turn_analyses_session_created
ON bogopa.chat_turn_analyses(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_turn_analyses_user_created
ON bogopa.chat_turn_analyses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_turn_analyses_primary_intent
ON bogopa.chat_turn_analyses(primary_intent);

CREATE INDEX IF NOT EXISTS idx_chat_turn_analyses_emotion
ON bogopa.chat_turn_analyses(emotion);
`;

type ChatMemoryVectorInsertParams = {
  userId: string;
  personaId: string;
  sessionId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  pairText: string;
  embedding: number[];
  responseMode: string[];
  questionUsed: boolean;
  tone: string[];
  importance: number;
  isUnresolved: boolean;
  userEmotion?: string | null;
  userIntent?: string | null;
  topicCategory?: string | null;
  entities?: string[];
  aiAction?: string | null;
  hasPromise?: boolean;
};

type ChatMemoryVectorSearchParams = {
  userId: string;
  personaId: string;
  embedding: number[];
  limit?: number;
};

type ChatMemoryVectorRow = {
  id: string;
  pair_text: string;
  response_mode: string[] | null;
  question_used: boolean;
  tone: string[] | null;
  importance: number;
  is_unresolved: boolean;
  user_emotion: string | null;
  user_intent: string | null;
  topic_category: string | null;
  entities: string[] | null;
  ai_action: string | null;
  has_promise: boolean;
  created_at: string;
  similarity: number;
};

export type ChatMemoryVectorResult = {
  id: string;
  pairText: string;
  responseMode: string[];
  questionUsed: boolean;
  tone: string[];
  importance: number;
  isUnresolved: boolean;
  userEmotion: string | null;
  userIntent: string | null;
  topicCategory: string | null;
  entities: string[];
  aiAction: string | null;
  hasPromise: boolean;
  createdAt: string;
  similarity: number;
};

let ensurePromise: Promise<void> | null = null;

function toVectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export async function ensureChatTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_CHAT_TABLES_SQL);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.personas ADD COLUMN IF NOT EXISTS avatar_source VARCHAR(24);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.personas ADD COLUMN IF NOT EXISTS avatar_key TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_turn_analyses DROP COLUMN IF EXISTS secondary_intent;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_turn_analyses ADD COLUMN IF NOT EXISTS desired_response_mode TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_turn_analyses ADD COLUMN IF NOT EXISTS unfinished_point TEXT;`);
      await pool.query(`
        UPDATE bogopa.personas
        SET avatar_source = 'default',
            avatar_key = avatar_url
        WHERE COALESCE(avatar_source, '') = ''
          AND avatar_url IS NOT NULL
          AND avatar_url LIKE '/%';
      `);
      await pool.query(`
        UPDATE bogopa.personas
        SET avatar_source = 'upload',
            avatar_key = substring(avatar_url from '(bogopa/(?:persona|user-profile)/[^?]+)')
        WHERE COALESCE(avatar_source, '') = ''
          AND avatar_url IS NOT NULL
          AND avatar_url ~ 'bogopa/(persona|user-profile)/';
      `);

      try {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS bogopa.chat_memory_vectors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR NOT NULL,
            persona_id VARCHAR NOT NULL,
            session_id UUID NOT NULL REFERENCES bogopa.chat_sessions(id) ON DELETE CASCADE,
            user_message_id UUID REFERENCES bogopa.chat_messages(id) ON DELETE SET NULL,
            assistant_message_id UUID REFERENCES bogopa.chat_messages(id) ON DELETE SET NULL,
            pair_text TEXT NOT NULL,
            embedding VECTOR(1536) NOT NULL,
            response_mode TEXT[] NOT NULL DEFAULT '{}'::text[],
            question_used BOOLEAN NOT NULL DEFAULT FALSE,
            tone TEXT[] NOT NULL DEFAULT '{}'::text[],
            importance SMALLINT NOT NULL DEFAULT 0,
            is_unresolved BOOLEAN NOT NULL DEFAULT FALSE,
            user_emotion TEXT,
            user_intent TEXT,
            topic_category TEXT,
            entities TEXT[] NOT NULL DEFAULT '{}'::text[],
            ai_action TEXT,
            has_promise BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_memory_vectors ADD COLUMN IF NOT EXISTS user_emotion TEXT;`);
        await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_memory_vectors ADD COLUMN IF NOT EXISTS user_intent TEXT;`);
        await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_memory_vectors ADD COLUMN IF NOT EXISTS topic_category TEXT;`);
        await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_memory_vectors ADD COLUMN IF NOT EXISTS entities TEXT[] NOT NULL DEFAULT '{}'::text[];`);
        await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_memory_vectors ADD COLUMN IF NOT EXISTS ai_action TEXT;`);
        await pool.query(`ALTER TABLE IF EXISTS bogopa.chat_memory_vectors ADD COLUMN IF NOT EXISTS has_promise BOOLEAN NOT NULL DEFAULT FALSE;`);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_chat_memory_vectors_scope
          ON bogopa.chat_memory_vectors(user_id, persona_id, created_at DESC);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_chat_memory_vectors_meta_lookup
          ON bogopa.chat_memory_vectors(user_id, persona_id, topic_category, user_emotion, created_at DESC);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_chat_memory_vectors_entities_gin
          ON bogopa.chat_memory_vectors
          USING GIN (entities);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_chat_memory_vectors_embedding_hnsw
          ON bogopa.chat_memory_vectors
          USING hnsw (embedding vector_cosine_ops);
        `);
      } catch (error) {
        console.warn("[chat-db] vector setup skipped", error);
      }
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

export async function ensureChatTurnAnalysesTable() {
  await ensureChatTables();
}

export async function savePersonaToDb(
  userId: string,
  personaId: string,
  name: string,
  avatarInput: {
    avatarSource?: string | null;
    avatarKey?: string | null;
    avatarUrl?: string | null;
  } | null,
  analysis: unknown,
  runtime: PersonaRuntime
) {
  await ensureChatTables();
  const pool = getDbPool();
  const normalizedAvatar = inferAvatarStorage({
    avatarSource: avatarInput?.avatarSource,
    avatarKey: avatarInput?.avatarKey,
    avatarUrl: avatarInput?.avatarUrl,
  });
  const avatarSource = normalizedAvatar.avatarSource;
  const avatarKey = normalizedAvatar.avatarKey;
  const avatarUrlForLegacyColumn =
    avatarSource === "default" ? normalizedAvatar.avatarUrl : null;

  await pool.query(
    `
    INSERT INTO bogopa.personas (user_id, persona_id, name, avatar_url, avatar_source, avatar_key, analysis, runtime)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
    ON CONFLICT (persona_id)
    DO UPDATE SET 
      name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url,
      avatar_source = EXCLUDED.avatar_source,
      avatar_key = EXCLUDED.avatar_key,
      analysis = EXCLUDED.analysis,
      runtime = EXCLUDED.runtime,
      updated_at = NOW()
    `,
    [
      userId,
      personaId,
      name,
      avatarUrlForLegacyColumn,
      avatarSource,
      avatarKey,
      JSON.stringify(analysis),
      JSON.stringify(runtime),
    ]
  );
}

export async function getPersonasForUser(userId: string) {
  await ensureChatTables();
  const pool = getDbPool();
  // Join with sessions to get the last message and latest activity timestamp
  const res = await pool.query(
    `SELECT 
      p.*, 
      s.id as session_id,
      s.updated_at as session_updated_at,
      (
        SELECT string_agg(m.content, ' ' ORDER BY m.created_at ASC)
        FROM bogopa.chat_messages m
        WHERE m.session_id = s.id
          AND m.role = (
            SELECT lm.role
            FROM bogopa.chat_messages lm
            WHERE lm.session_id = s.id
            ORDER BY lm.created_at DESC, lm.id DESC
            LIMIT 1
          )
          AND m.created_at > COALESCE(
            (
              SELECT MAX(prev.created_at)
              FROM bogopa.chat_messages prev
              WHERE prev.session_id = s.id
                AND prev.role <> (
                  SELECT lm.role
                  FROM bogopa.chat_messages lm
                  WHERE lm.session_id = s.id
                  ORDER BY lm.created_at DESC, lm.id DESC
                  LIMIT 1
                )
            ),
            '-infinity'::timestamptz
          )
      ) as last_message_content
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

export async function saveTurnAnalysisToDb(input: SaveTurnAnalysisInput) {
  await ensureChatTurnAnalysesTable();
  const pool = getDbPool();

  const res = await pool.query(
    `
    INSERT INTO bogopa.chat_turn_analyses (
      session_id,
      user_message_id,
      assistant_message_id,
      user_id,
      persona_id,
      relation_group,
      taxonomy_version,
      topic,
      topic_shift,
      primary_intent,
      emotion,
      intensity,
      desired_response_mode,
      unfinished_point,
      text_quality,
      risk_level,
      confidence,
      reason,
      raw_analysis,
      model
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20
    )
    RETURNING *
    `,
    [
      input.sessionId,
      input.userMessageId,
      input.assistantMessageId ?? null,
      input.userId,
      input.personaId,
      input.relationGroup,
      input.taxonomyVersion ?? "v1.0",
      input.analysis.topic,
      input.analysis.topicShift,
      input.analysis.primaryIntent,
      input.analysis.emotion,
      input.analysis.intensity,
      input.analysis.desiredResponseMode,
      input.analysis.unfinishedPoint,
      input.analysis.textQuality,
      STORED_ANALYSIS_RISK_LEVEL,
      STORED_ANALYSIS_CONFIDENCE,
      input.analysis.reason,
      JSON.stringify(input.rawAnalysis ?? {}),
      input.model ?? null,
    ],
  );

  return res.rows[0];
}

export async function updateTurnAnalysisAssistantMessageId(analysisId: string, assistantMessageId: string) {
  await ensureChatTurnAnalysesTable();
  const pool = getDbPool();

  const res = await pool.query(
    `
    UPDATE bogopa.chat_turn_analyses
    SET assistant_message_id = $2
    WHERE id = $1
    RETURNING *
    `,
    [analysisId, assistantMessageId],
  );

  return res.rows[0] || null;
}

export async function getLatestTurnAnalysisForSession(sessionId: string) {
  await ensureChatTurnAnalysesTable();
  const pool = getDbPool();
  const res = await pool.query(
    `
    SELECT
      topic,
      topic_shift,
      primary_intent,
      emotion,
      intensity,
      desired_response_mode,
      unfinished_point,
      text_quality,
      reason
    FROM bogopa.chat_turn_analyses
    WHERE session_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [sessionId],
  );
  return res.rows[0] || null;
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
    `SELECT id, role, content, created_at FROM bogopa.chat_messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC`,
    [sessionId]
  );
  return res.rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at
  }));
}

export async function insertChatMemoryVector(params: ChatMemoryVectorInsertParams) {
  await ensureChatTables();
  const pool = getDbPool();
  const responseMode = params.responseMode.filter(Boolean).slice(0, 4);
  const tone = params.tone.filter(Boolean).slice(0, 4);
  const entities = (params.entities || []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  const importance = Math.max(0, Math.min(10, Math.round(params.importance || 0)));
  const vectorLiteral = toVectorLiteral(params.embedding);

  try {
    await pool.query(
      `
      INSERT INTO bogopa.chat_memory_vectors (
        user_id, persona_id, session_id, user_message_id, assistant_message_id,
        pair_text, embedding, response_mode, question_used, tone, importance, is_unresolved,
        user_emotion, user_intent, topic_category, entities, ai_action, has_promise
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8::text[], $9, $10::text[], $11::smallint, $12, $13, $14, $15, $16::text[], $17, $18)
      `,
      [
        params.userId,
        params.personaId,
        params.sessionId,
        params.userMessageId,
        params.assistantMessageId,
        params.pairText,
        vectorLiteral,
        responseMode,
        params.questionUsed,
        tone,
        importance,
        params.isUnresolved,
        params.userEmotion || null,
        params.userIntent || null,
        params.topicCategory || null,
        entities,
        params.aiAction || null,
        Boolean(params.hasPromise),
      ],
    );
  } catch (error) {
    console.warn("[chat-db] failed to insert memory vector", error);
  }
}

export async function searchSimilarChatMemoryVectors(params: ChatMemoryVectorSearchParams): Promise<ChatMemoryVectorResult[]> {
  await ensureChatTables();
  const pool = getDbPool();
  const vectorLiteral = toVectorLiteral(params.embedding);
  const limit = Math.max(1, Math.min(20, params.limit ?? 8));

  try {
    const res = await pool.query<ChatMemoryVectorRow>(
      `
      SELECT
        id,
        pair_text,
        response_mode,
        question_used,
        tone,
        importance,
        is_unresolved,
        user_emotion,
        user_intent,
        topic_category,
        entities,
        ai_action,
        has_promise,
        created_at,
        1 - (embedding <=> $3::vector) AS similarity
      FROM bogopa.chat_memory_vectors
      WHERE user_id = $1
        AND persona_id = $2
      ORDER BY embedding <=> $3::vector
      LIMIT $4
      `,
      [params.userId, params.personaId, vectorLiteral, limit],
    );

    return res.rows.map((row) => ({
      id: row.id,
      pairText: row.pair_text,
      responseMode: row.response_mode || [],
      questionUsed: Boolean(row.question_used),
      tone: row.tone || [],
      importance: Number(row.importance || 0),
      isUnresolved: Boolean(row.is_unresolved),
      userEmotion: row.user_emotion || null,
      userIntent: row.user_intent || null,
      topicCategory: row.topic_category || null,
      entities: row.entities || [],
      aiAction: row.ai_action || null,
      hasPromise: Boolean(row.has_promise),
      createdAt: row.created_at,
      similarity: Number(row.similarity || 0),
    }));
  } catch (error) {
    console.warn("[chat-db] memory vector search skipped", error);
    return [];
  }
}


export async function clearSessionMessages(sessionId: string) {
  await ensureChatTables();
  const pool = getDbPool();
  await pool.query(
    "DELETE FROM bogopa.chat_messages WHERE session_id = $1",
    [sessionId]
  );
  await pool.query(
    "UPDATE bogopa.chat_sessions SET updated_at = NOW() WHERE id = $1",
    [sessionId]
  );
}
