import { getDbPool } from "@/lib/server/db";
import { ensureChatTables } from "@/lib/server/chat-db";

const CREATE_ANALYTICS_TABLE_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.analytics_events (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  event_name VARCHAR(64) NOT NULL,
  session_id UUID,
  persona_id VARCHAR,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_time
  ON bogopa.analytics_events (event_name, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time
  ON bogopa.analytics_events (user_id, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_props
  ON bogopa.analytics_events USING GIN (properties);
`;

export const ALLOWED_ANALYTICS_EVENT_NAMES = [
  "app_open",
  "app_performance",
  "app_error",
  "session_start",
  "message_sent",
  "message_received",
  "limit_reached",
  "paywall_view",
  "paywall_cta_clicked",
  "subscription_started",
  "token_purchased",
  "persona_created",
  "persona_edited",
  "memory_added",
] as const;

export type AnalyticsEventName = (typeof ALLOWED_ANALYTICS_EVENT_NAMES)[number];

type QueryExecutor = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

type LogAnalyticsEventInput = {
  userId: string;
  eventName: AnalyticsEventName;
  sessionId?: string | null;
  personaId?: string | null;
  eventTime?: string | Date | null;
  properties?: Record<string, unknown> | null;
};

let ensureAnalyticsPromise: Promise<void> | null = null;

function normalizeNonEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUuid(value: unknown) {
  const normalized = normalizeNonEmpty(value);
  if (!normalized) return null;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(normalized) ? normalized.toLowerCase() : null;
}

function cleanProperties(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const next = value
      .map((item) => cleanProperties(item))
      .filter((item) => item !== undefined);
    return next.length > 0 ? next : undefined;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, cleanProperties(item)] as const)
      .filter(([, item]) => item !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  return undefined;
}

function normalizeEventTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) return null;
  return asDate.toISOString();
}

export async function ensureAnalyticsTables() {
  if (!ensureAnalyticsPromise) {
    ensureAnalyticsPromise = (async () => {
      await ensureChatTables();
      const pool = getDbPool();
      await pool.query(CREATE_ANALYTICS_TABLE_SQL);
    })().catch((error) => {
      ensureAnalyticsPromise = null;
      throw error;
    });
  }
  return ensureAnalyticsPromise;
}

export async function logAnalyticsEvent(
  input: LogAnalyticsEventInput,
  executor?: QueryExecutor,
) {
  const userId = normalizeNonEmpty(input.userId);
  if (!userId) return;

  await ensureAnalyticsTables();
  const queryRunner = executor ?? getDbPool();

  const properties = (cleanProperties(input.properties || {}) || {}) as Record<string, unknown>;
  const eventTimeIso = normalizeEventTime(input.eventTime);
  const normalizedSessionId = normalizeUuid(input.sessionId);

  await queryRunner.query(
    `
    INSERT INTO bogopa.analytics_events (
      user_id,
      event_name,
      session_id,
      persona_id,
      properties,
      event_time
    )
    VALUES ($1, $2, $3::uuid, NULLIF($4, ''), $5::jsonb, COALESCE($6::timestamptz, NOW()))
    `,
    [
      userId,
      input.eventName,
      normalizedSessionId,
      normalizeNonEmpty(input.personaId),
      JSON.stringify(properties),
      eventTimeIso,
    ],
  );
}

export async function logAnalyticsEventSafe(input: LogAnalyticsEventInput) {
  try {
    await logAnalyticsEvent(input);
  } catch (error) {
    console.warn("[analytics] failed to log event", {
      eventName: input.eventName,
      error,
    });
  }
}

export type KpiTableRow = {
  revisitHourKst: number;
  revisitUsers: number;
  revisitSessions: number;
  d1RetentionPct: number;
  d7RetentionPct: number;
  avgTurnsPerSession: number;
  longSessionRatioPct: number;
  avgUserMessageLength: number;
  memoryInjectionRatePct: number;
  dryStreakUsers: number;
  dryStreakRatePct: number;
  retryRatePct: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  paywallToPurchaseRatePct: number;
  dropoffAfterAiTurnPct: number;
};

export async function getKpiTableRows(daysInput: number) {
  await ensureAnalyticsTables();
  const pool = getDbPool();
  const days = Math.max(1, Math.min(365, Number(daysInput || 30)));

  const result = await pool.query(
    `
    WITH params AS (
      SELECT $1::int AS days
    ),
    range_window AS (
      SELECT NOW() - make_interval(days => (SELECT days FROM params)) AS since_ts
    ),
    first_seen AS (
      SELECT user_id, MIN((event_time AT TIME ZONE 'Asia/Seoul')::date) AS first_day
      FROM bogopa.analytics_events
      WHERE event_name = 'session_start'
      GROUP BY user_id
    ),
    d1_base AS (
      SELECT
        f.user_id,
        EXISTS (
          SELECT 1
          FROM bogopa.analytics_events e
          WHERE e.user_id = f.user_id
            AND e.event_name = 'session_start'
            AND (e.event_time AT TIME ZONE 'Asia/Seoul')::date = f.first_day + 1
        ) AS retained
      FROM first_seen f
      WHERE f.first_day <= ((NOW() AT TIME ZONE 'Asia/Seoul')::date - 1)
    ),
    d7_base AS (
      SELECT
        f.user_id,
        EXISTS (
          SELECT 1
          FROM bogopa.analytics_events e
          WHERE e.user_id = f.user_id
            AND e.event_name = 'session_start'
            AND (e.event_time AT TIME ZONE 'Asia/Seoul')::date = f.first_day + 7
        ) AS retained
      FROM first_seen f
      WHERE f.first_day <= ((NOW() AT TIME ZONE 'Asia/Seoul')::date - 7)
    ),
    session_starts_all AS (
      SELECT
        user_id,
        event_time,
        EXTRACT(HOUR FROM (event_time AT TIME ZONE 'Asia/Seoul'))::int AS hour_kst,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY event_time) AS seq
      FROM bogopa.analytics_events
      WHERE event_name = 'session_start'
    ),
    revisit_hour AS (
      SELECT
        s.hour_kst,
        COUNT(*)::int AS revisit_sessions,
        COUNT(DISTINCT s.user_id)::int AS revisit_users
      FROM session_starts_all s
      CROSS JOIN range_window rw
      WHERE s.seq > 1
        AND s.event_time >= rw.since_ts
      GROUP BY s.hour_kst
    ),
    session_turns AS (
      SELECT m.session_id, COUNT(*)::int AS turns
      FROM bogopa.chat_messages m
      CROSS JOIN range_window rw
      WHERE m.role IN ('user', 'assistant')
        AND m.created_at >= rw.since_ts
      GROUP BY m.session_id
    ),
    assistant_turns AS (
      SELECT
        m.session_id,
        m.created_at,
        (
          SELECT MIN(u.created_at)
          FROM bogopa.chat_messages u
          WHERE u.session_id = m.session_id
            AND u.role = 'user'
            AND u.created_at > m.created_at
        ) AS next_user_at
      FROM bogopa.chat_messages m
      CROSS JOIN range_window rw
      WHERE m.role = 'assistant'
        AND m.created_at >= rw.since_ts
    ),
    active_users AS (
      SELECT COUNT(DISTINCT e.user_id)::numeric AS user_count
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_name = 'session_start'
        AND e.event_time >= rw.since_ts
    ),
    persona_events AS (
      SELECT
        COALESCE((e.properties->>'memoryCount')::int, 0) AS memory_count,
        COALESCE((e.properties->>'frequentPhrasesCount')::int, 0) AS phrase_count,
        COALESCE((e.properties->>'profileFieldCount')::int, 0) AS profile_field_count,
        COALESCE((e.properties->>'hasAvatar')::boolean, false) AS has_avatar
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_name IN ('persona_created', 'persona_edited')
        AND e.event_time >= rw.since_ts
    ),
    user_messages AS (
      SELECT
        e.user_id,
        e.session_id,
        e.event_time,
        COALESCE((e.properties->>'messageLength')::int, 0) AS message_length
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_name = 'message_sent'
        AND e.event_time >= rw.since_ts
        AND e.session_id IS NOT NULL
        AND (e.properties ? 'messageLength')
    ),
    dry_streak_users AS (
      SELECT DISTINCT m.user_id
      FROM (
        SELECT
          user_id,
          session_id,
          message_length,
          LEAD(message_length, 1) OVER (PARTITION BY user_id, session_id ORDER BY event_time) AS next_len_1,
          LEAD(message_length, 2) OVER (PARTITION BY user_id, session_id ORDER BY event_time) AS next_len_2
        FROM user_messages
      ) m
      WHERE m.message_length < 10
        AND m.next_len_1 < 10
        AND m.next_len_2 < 10
    ),
    msg_sent AS (
      SELECT
        AVG((e.properties->>'messageLength')::numeric) AS avg_user_message_length
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_name = 'message_sent'
        AND e.event_time >= rw.since_ts
        AND (e.properties ? 'messageLength')
    ),
    msg_recv AS (
      SELECT
        AVG((e.properties->>'responseTimeMs')::numeric) AS avg_response_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (e.properties->>'responseTimeMs')::numeric) AS p95_response_time_ms,
        (100.0 * SUM(CASE WHEN COALESCE((e.properties->>'retryTriggered')::boolean, false) THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0)) AS retry_rate_pct
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_name = 'message_received'
        AND e.event_time >= rw.since_ts
        AND (e.properties ? 'responseTimeMs')
    ),
    paywall AS (
      SELECT
        COUNT(*) FILTER (WHERE e.event_name = 'paywall_view')::numeric AS paywall_views,
        COUNT(*) FILTER (WHERE e.event_name IN ('subscription_started', 'token_purchased'))::numeric AS purchases
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_time >= rw.since_ts
    ),
    global_metrics AS (
      SELECT
        COALESCE((SELECT ROUND(100.0 * SUM(CASE WHEN retained THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0), 2) FROM d1_base), 0)::numeric AS d1_retention_pct,
        COALESCE((SELECT ROUND(100.0 * SUM(CASE WHEN retained THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0), 2) FROM d7_base), 0)::numeric AS d7_retention_pct,
        COALESCE((SELECT ROUND(AVG(turns)::numeric, 2) FROM session_turns), 0)::numeric AS avg_turns_per_session,
        COALESCE((SELECT ROUND(100.0 * SUM(CASE WHEN turns >= 10 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0), 2) FROM session_turns), 0)::numeric AS long_session_ratio_pct,
        COALESCE((SELECT ROUND(avg_user_message_length::numeric, 2) FROM msg_sent), 0)::numeric AS avg_user_message_length,
        COALESCE((
          SELECT ROUND(
            100.0 * SUM(
              CASE WHEN memory_count > 0 OR phrase_count > 0 OR profile_field_count > 0 OR has_avatar THEN 1 ELSE 0 END
            )::numeric / NULLIF(COUNT(*), 0),
            2
          )
          FROM persona_events
        ), 0)::numeric AS memory_injection_rate_pct,
        COALESCE((SELECT COUNT(*)::numeric FROM dry_streak_users), 0)::numeric AS dry_streak_users,
        COALESCE((
          SELECT ROUND(
            100.0 * (SELECT COUNT(*)::numeric FROM dry_streak_users) / NULLIF((SELECT user_count FROM active_users), 0),
            2
          )
        ), 0)::numeric AS dry_streak_rate_pct,
        COALESCE((SELECT ROUND(retry_rate_pct::numeric, 2) FROM msg_recv), 0)::numeric AS retry_rate_pct,
        COALESCE((SELECT ROUND(avg_response_time_ms::numeric, 2) FROM msg_recv), 0)::numeric AS avg_response_time_ms,
        COALESCE((SELECT ROUND(p95_response_time_ms::numeric, 2) FROM msg_recv), 0)::numeric AS p95_response_time_ms,
        COALESCE((SELECT ROUND(100.0 * purchases / NULLIF(paywall_views, 0), 2) FROM paywall), 0)::numeric AS paywall_to_purchase_rate_pct,
        COALESCE((
          SELECT ROUND(100.0 * AVG(CASE WHEN next_user_at IS NULL OR next_user_at > created_at + INTERVAL '1 minute' THEN 1.0 ELSE 0.0 END)::numeric, 2)
          FROM assistant_turns
        ), 0)::numeric AS dropoff_after_ai_turn_pct
    ),
    hours AS (
      SELECT generate_series(0, 23)::int AS hour_kst
    )
    SELECT
      h.hour_kst AS revisit_hour_kst,
      COALESCE(r.revisit_users, 0)::int AS revisit_users,
      COALESCE(r.revisit_sessions, 0)::int AS revisit_sessions,
      g.d1_retention_pct,
      g.d7_retention_pct,
      g.avg_turns_per_session,
      g.long_session_ratio_pct,
      g.avg_user_message_length,
      g.memory_injection_rate_pct,
      g.dry_streak_users,
      g.dry_streak_rate_pct,
      g.retry_rate_pct,
      g.avg_response_time_ms,
      g.p95_response_time_ms,
      g.paywall_to_purchase_rate_pct,
      g.dropoff_after_ai_turn_pct
    FROM hours h
    LEFT JOIN revisit_hour r ON r.hour_kst = h.hour_kst
    CROSS JOIN global_metrics g
    ORDER BY h.hour_kst ASC
    `,
    [days],
  );

  return result.rows.map((row) => ({
    revisitHourKst: Number(row.revisit_hour_kst || 0),
    revisitUsers: Number(row.revisit_users || 0),
    revisitSessions: Number(row.revisit_sessions || 0),
    d1RetentionPct: Number(row.d1_retention_pct || 0),
    d7RetentionPct: Number(row.d7_retention_pct || 0),
    avgTurnsPerSession: Number(row.avg_turns_per_session || 0),
    longSessionRatioPct: Number(row.long_session_ratio_pct || 0),
    avgUserMessageLength: Number(row.avg_user_message_length || 0),
    memoryInjectionRatePct: Number(row.memory_injection_rate_pct || 0),
    dryStreakUsers: Number(row.dry_streak_users || 0),
    dryStreakRatePct: Number(row.dry_streak_rate_pct || 0),
    retryRatePct: Number(row.retry_rate_pct || 0),
    avgResponseTimeMs: Number(row.avg_response_time_ms || 0),
    p95ResponseTimeMs: Number(row.p95_response_time_ms || 0),
    paywallToPurchaseRatePct: Number(row.paywall_to_purchase_rate_pct || 0),
    dropoffAfterAiTurnPct: Number(row.dropoff_after_ai_turn_pct || 0),
  })) as KpiTableRow[];
}
