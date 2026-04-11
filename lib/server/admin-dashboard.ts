import { getIapPriceKrwMap } from "@/lib/iap/pricing";
import { KpiTableRow, getKpiTableRows } from "@/lib/server/analytics";
import { getDbPool } from "@/lib/server/db";
import { ensureIapTables } from "@/lib/server/iap";

export type AdminTopLevelSnapshot = {
  d1RetentionPct: number;
  d7RetentionPct: number;
  paywallToPurchaseRatePct: number;
  dropoffAfterAiTurnPct: number;
};

export type AdminRevenueSummary = {
  dailyKrw: number;
  weeklyKrw: number;
  monthlyKrw: number;
};

export type AdminResponseTrendRow = {
  hourKst: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
};

export type AdminDiagnosticsSummary = {
  appOpenCount: number;
  appErrorCount: number;
  runtimeErrorCount: number;
  unhandledRejectionCount: number;
  performanceSampleCount: number;
  avgAppLoadMs: number;
  p95AppLoadMs: number;
  avgLcpMs: number;
  p95LcpMs: number;
  avgCls: number;
};

export type AdminDiagnosticsByPathRow = {
  path: string;
  opens: number;
  errors: number;
  errorRatePct: number;
  avgAppLoadMs: number;
  avgLcpMs: number;
};

export type AdminDiagnosticsErrorTrendRow = {
  hourKst: number;
  opens: number;
  errors: number;
  errorRatePct: number;
};

export type AdminDashboardPayload = {
  days: number;
  generatedAt: string;
  rows: KpiTableRow[];
  today: AdminTopLevelSnapshot;
  previousDay: AdminTopLevelSnapshot;
  responseTrend: AdminResponseTrendRow[];
  diagnosticsSummary: AdminDiagnosticsSummary;
  diagnosticsByPath: AdminDiagnosticsByPathRow[];
  diagnosticsErrorTrend: AdminDiagnosticsErrorTrendRow[];
  revenue: AdminRevenueSummary;
};

function clampDays(daysInput: number) {
  if (!Number.isFinite(daysInput)) return 30;
  return Math.max(1, Math.min(365, Math.trunc(daysInput)));
}

async function getDailySnapshot(reportDay: string): Promise<AdminTopLevelSnapshot> {
  if (!reportDay) {
    return {
      d1RetentionPct: 0,
      d7RetentionPct: 0,
      paywallToPurchaseRatePct: 0,
      dropoffAfterAiTurnPct: 0,
    };
  }
  const pool = getDbPool();
  const result = await pool.query(
    `
    WITH report_day AS (
      SELECT $1::date AS day_kst
    ),
    first_seen AS (
      SELECT user_id, MIN((event_time AT TIME ZONE 'Asia/Seoul')::date) AS first_day
      FROM bogopa.analytics_events
      WHERE event_name = 'session_start'
      GROUP BY user_id
    ),
    session_days AS (
      SELECT DISTINCT
        user_id,
        (event_time AT TIME ZONE 'Asia/Seoul')::date AS day_kst
      FROM bogopa.analytics_events
      WHERE event_name = 'session_start'
    ),
    d1 AS (
      SELECT
        COUNT(*)::numeric AS cohort,
        COUNT(sd.user_id)::numeric AS retained
      FROM first_seen f
      LEFT JOIN session_days sd
        ON sd.user_id = f.user_id
       AND sd.day_kst = (SELECT day_kst FROM report_day)
      WHERE f.first_day = (SELECT day_kst FROM report_day) - 1
    ),
    d7 AS (
      SELECT
        COUNT(*)::numeric AS cohort,
        COUNT(sd.user_id)::numeric AS retained
      FROM first_seen f
      LEFT JOIN session_days sd
        ON sd.user_id = f.user_id
       AND sd.day_kst = (SELECT day_kst FROM report_day)
      WHERE f.first_day = (SELECT day_kst FROM report_day) - 7
    ),
    paywall AS (
      SELECT
        COUNT(*) FILTER (WHERE e.event_name = 'paywall_view')::numeric AS views,
        COUNT(*) FILTER (WHERE e.event_name IN ('subscription_started', 'token_purchased'))::numeric AS purchases
      FROM bogopa.analytics_events e
      WHERE (e.event_time AT TIME ZONE 'Asia/Seoul')::date = (SELECT day_kst FROM report_day)
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
      WHERE m.role = 'assistant'
        AND (m.created_at AT TIME ZONE 'Asia/Seoul')::date = (SELECT day_kst FROM report_day)
    )
    SELECT
      COALESCE((SELECT ROUND(100.0 * retained / NULLIF(cohort, 0), 2) FROM d1), 0)::numeric AS d1_retention_pct,
      COALESCE((SELECT ROUND(100.0 * retained / NULLIF(cohort, 0), 2) FROM d7), 0)::numeric AS d7_retention_pct,
      COALESCE((SELECT ROUND(100.0 * purchases / NULLIF(views, 0), 2) FROM paywall), 0)::numeric AS paywall_to_purchase_rate_pct,
      COALESCE((
        SELECT ROUND(
          100.0 * AVG(
            CASE
              WHEN next_user_at IS NULL OR next_user_at > created_at + INTERVAL '1 minute' THEN 1.0
              ELSE 0.0
            END
          )::numeric,
          2
        )
        FROM assistant_turns
      ), 0)::numeric AS dropoff_after_ai_turn_pct
    `,
    [reportDay],
  );

  const row = result.rows[0] || {};
  return {
    d1RetentionPct: Number(row.d1_retention_pct || 0),
    d7RetentionPct: Number(row.d7_retention_pct || 0),
    paywallToPurchaseRatePct: Number(row.paywall_to_purchase_rate_pct || 0),
    dropoffAfterAiTurnPct: Number(row.dropoff_after_ai_turn_pct || 0),
  };
}

function shiftDate(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map((value) => Number(value));
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getResponseTrendByHour(days: number): Promise<AdminResponseTrendRow[]> {
  const pool = getDbPool();
  const result = await pool.query(
    `
    WITH range_window AS (
      SELECT NOW() - make_interval(days => $1::int) AS since_ts
    ),
    hourly AS (
      SELECT
        EXTRACT(HOUR FROM (e.event_time AT TIME ZONE 'Asia/Seoul'))::int AS hour_kst,
        AVG((e.properties->>'responseTimeMs')::numeric) AS avg_response_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (e.properties->>'responseTimeMs')::numeric) AS p95_response_time_ms
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_name = 'message_received'
        AND e.event_time >= rw.since_ts
        AND (e.properties ? 'responseTimeMs')
      GROUP BY 1
    ),
    hours AS (
      SELECT generate_series(0, 23)::int AS hour_kst
    )
    SELECT
      h.hour_kst,
      COALESCE(ROUND(hourly.avg_response_time_ms::numeric, 2), 0)::numeric AS avg_response_time_ms,
      COALESCE(ROUND(hourly.p95_response_time_ms::numeric, 2), 0)::numeric AS p95_response_time_ms
    FROM hours h
    LEFT JOIN hourly ON hourly.hour_kst = h.hour_kst
    ORDER BY h.hour_kst ASC
    `,
    [days],
  );

  return result.rows.map((row) => ({
    hourKst: Number(row.hour_kst || 0),
    avgResponseTimeMs: Number(row.avg_response_time_ms || 0),
    p95ResponseTimeMs: Number(row.p95_response_time_ms || 0),
  }));
}

async function getDiagnosticsSummary(days: number): Promise<AdminDiagnosticsSummary> {
  const pool = getDbPool();
  const result = await pool.query(
    `
    WITH range_window AS (
      SELECT NOW() - make_interval(days => $1::int) AS since_ts
    ),
    events AS (
      SELECT event_name, properties
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_time >= rw.since_ts
        AND e.event_name IN ('app_open', 'app_performance', 'app_error')
    ),
    perf AS (
      SELECT
        CASE
          WHEN (properties ? 'appLoadMs') AND (properties->>'appLoadMs') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN (properties->>'appLoadMs')::numeric
          ELSE NULL
        END AS app_load_ms,
        CASE
          WHEN (properties ? 'lcpMs') AND (properties->>'lcpMs') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN (properties->>'lcpMs')::numeric
          ELSE NULL
        END AS lcp_ms,
        CASE
          WHEN (properties ? 'cls') AND (properties->>'cls') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN (properties->>'cls')::numeric
          ELSE NULL
        END AS cls
      FROM events
      WHERE event_name = 'app_performance'
    )
    SELECT
      COALESCE((SELECT COUNT(*) FROM events WHERE event_name = 'app_open'), 0)::int AS app_open_count,
      COALESCE((SELECT COUNT(*) FROM events WHERE event_name = 'app_error'), 0)::int AS app_error_count,
      COALESCE((SELECT COUNT(*) FROM events WHERE event_name = 'app_error' AND COALESCE(properties->>'type', '') = 'error'), 0)::int AS runtime_error_count,
      COALESCE((SELECT COUNT(*) FROM events WHERE event_name = 'app_error' AND COALESCE(properties->>'type', '') = 'unhandledrejection'), 0)::int AS unhandled_rejection_count,
      COALESCE((SELECT COUNT(*) FROM perf), 0)::int AS performance_sample_count,
      COALESCE((SELECT ROUND(AVG(app_load_ms), 2) FROM perf WHERE app_load_ms IS NOT NULL), 0)::numeric AS avg_app_load_ms,
      COALESCE((SELECT ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY app_load_ms), 2) FROM perf WHERE app_load_ms IS NOT NULL), 0)::numeric AS p95_app_load_ms,
      COALESCE((SELECT ROUND(AVG(lcp_ms), 2) FROM perf WHERE lcp_ms IS NOT NULL), 0)::numeric AS avg_lcp_ms,
      COALESCE((SELECT ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY lcp_ms), 2) FROM perf WHERE lcp_ms IS NOT NULL), 0)::numeric AS p95_lcp_ms,
      COALESCE((SELECT ROUND(AVG(cls), 4) FROM perf WHERE cls IS NOT NULL), 0)::numeric AS avg_cls
    `,
    [days],
  );

  const row = result.rows[0] || {};
  return {
    appOpenCount: Number(row.app_open_count || 0),
    appErrorCount: Number(row.app_error_count || 0),
    runtimeErrorCount: Number(row.runtime_error_count || 0),
    unhandledRejectionCount: Number(row.unhandled_rejection_count || 0),
    performanceSampleCount: Number(row.performance_sample_count || 0),
    avgAppLoadMs: Number(row.avg_app_load_ms || 0),
    p95AppLoadMs: Number(row.p95_app_load_ms || 0),
    avgLcpMs: Number(row.avg_lcp_ms || 0),
    p95LcpMs: Number(row.p95_lcp_ms || 0),
    avgCls: Number(row.avg_cls || 0),
  };
}

async function getDiagnosticsByPath(days: number): Promise<AdminDiagnosticsByPathRow[]> {
  const pool = getDbPool();
  const result = await pool.query(
    `
    WITH range_window AS (
      SELECT NOW() - make_interval(days => $1::int) AS since_ts
    ),
    opens AS (
      SELECT
        COALESCE(NULLIF(properties->>'path', ''), '(unknown)') AS path,
        COUNT(*)::int AS opens
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_time >= rw.since_ts
        AND e.event_name = 'app_open'
      GROUP BY 1
    ),
    errors AS (
      SELECT
        COALESCE(NULLIF(properties->>'path', ''), '(unknown)') AS path,
        COUNT(*)::int AS errors
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_time >= rw.since_ts
        AND e.event_name = 'app_error'
      GROUP BY 1
    ),
    perf AS (
      SELECT
        COALESCE(NULLIF(properties->>'path', ''), '(unknown)') AS path,
        AVG(
          CASE
            WHEN (properties ? 'appLoadMs') AND (properties->>'appLoadMs') ~ '^[0-9]+(\\.[0-9]+)?$'
              THEN (properties->>'appLoadMs')::numeric
            ELSE NULL
          END
        ) AS avg_app_load_ms,
        AVG(
          CASE
            WHEN (properties ? 'lcpMs') AND (properties->>'lcpMs') ~ '^[0-9]+(\\.[0-9]+)?$'
              THEN (properties->>'lcpMs')::numeric
            ELSE NULL
          END
        ) AS avg_lcp_ms
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_time >= rw.since_ts
        AND e.event_name = 'app_performance'
      GROUP BY 1
    ),
    merged AS (
      SELECT
        COALESCE(o.path, er.path, p.path) AS path,
        COALESCE(o.opens, 0)::int AS opens,
        COALESCE(er.errors, 0)::int AS errors,
        COALESCE(p.avg_app_load_ms, 0)::numeric AS avg_app_load_ms,
        COALESCE(p.avg_lcp_ms, 0)::numeric AS avg_lcp_ms
      FROM opens o
      FULL OUTER JOIN errors er ON er.path = o.path
      FULL OUTER JOIN perf p ON p.path = COALESCE(o.path, er.path)
    )
    SELECT
      path,
      opens,
      errors,
      COALESCE(ROUND(100.0 * errors::numeric / NULLIF(opens, 0), 2), 0)::numeric AS error_rate_pct,
      ROUND(avg_app_load_ms, 2)::numeric AS avg_app_load_ms,
      ROUND(avg_lcp_ms, 2)::numeric AS avg_lcp_ms
    FROM merged
    ORDER BY opens DESC, errors DESC, path ASC
    LIMIT 8
    `,
    [days],
  );

  return result.rows.map((row) => ({
    path: String(row.path || "(unknown)"),
    opens: Number(row.opens || 0),
    errors: Number(row.errors || 0),
    errorRatePct: Number(row.error_rate_pct || 0),
    avgAppLoadMs: Number(row.avg_app_load_ms || 0),
    avgLcpMs: Number(row.avg_lcp_ms || 0),
  }));
}

async function getDiagnosticsErrorTrendByHour(days: number): Promise<AdminDiagnosticsErrorTrendRow[]> {
  const pool = getDbPool();
  const result = await pool.query(
    `
    WITH range_window AS (
      SELECT NOW() - make_interval(days => $1::int) AS since_ts
    ),
    opens AS (
      SELECT
        EXTRACT(HOUR FROM (e.event_time AT TIME ZONE 'Asia/Seoul'))::int AS hour_kst,
        COUNT(*)::int AS opens
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_time >= rw.since_ts
        AND e.event_name = 'app_open'
      GROUP BY 1
    ),
    errors AS (
      SELECT
        EXTRACT(HOUR FROM (e.event_time AT TIME ZONE 'Asia/Seoul'))::int AS hour_kst,
        COUNT(*)::int AS errors
      FROM bogopa.analytics_events e
      CROSS JOIN range_window rw
      WHERE e.event_time >= rw.since_ts
        AND e.event_name = 'app_error'
      GROUP BY 1
    ),
    hours AS (
      SELECT generate_series(0, 23)::int AS hour_kst
    )
    SELECT
      h.hour_kst,
      COALESCE(o.opens, 0)::int AS opens,
      COALESCE(er.errors, 0)::int AS errors,
      COALESCE(ROUND(100.0 * COALESCE(er.errors, 0)::numeric / NULLIF(COALESCE(o.opens, 0), 0), 2), 0)::numeric AS error_rate_pct
    FROM hours h
    LEFT JOIN opens o ON o.hour_kst = h.hour_kst
    LEFT JOIN errors er ON er.hour_kst = h.hour_kst
    ORDER BY h.hour_kst ASC
    `,
    [days],
  );

  return result.rows.map((row) => ({
    hourKst: Number(row.hour_kst || 0),
    opens: Number(row.opens || 0),
    errors: Number(row.errors || 0),
    errorRatePct: Number(row.error_rate_pct || 0),
  }));
}

async function getRevenueSummary(): Promise<AdminRevenueSummary> {
  await ensureIapTables();
  const pool = getDbPool();
  const priceMap = getIapPriceKrwMap();

  const result = await pool.query(
    `
    WITH prices AS (
      SELECT $1::jsonb AS map
    ),
    purchases AS (
      SELECT
        COALESCE(p.purchased_at, p.created_at) AS purchased_ts,
        p.product_key,
        COALESCE(((SELECT map FROM prices) ->> p.product_key)::int, 0) AS price_krw
      FROM bogopa.user_iap_purchases p
      WHERE p.applied_at IS NOT NULL
    ),
    window_kst AS (
      SELECT
        date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AS day_start_kst,
        date_trunc('week', NOW() AT TIME ZONE 'Asia/Seoul') AS week_start_kst,
        date_trunc('month', NOW() AT TIME ZONE 'Asia/Seoul') AS month_start_kst
    )
    SELECT
      COALESCE(SUM(CASE WHEN (purchased_ts AT TIME ZONE 'Asia/Seoul') >= w.day_start_kst THEN price_krw ELSE 0 END), 0)::bigint AS daily_krw,
      COALESCE(SUM(CASE WHEN (purchased_ts AT TIME ZONE 'Asia/Seoul') >= w.week_start_kst THEN price_krw ELSE 0 END), 0)::bigint AS weekly_krw,
      COALESCE(SUM(CASE WHEN (purchased_ts AT TIME ZONE 'Asia/Seoul') >= w.month_start_kst THEN price_krw ELSE 0 END), 0)::bigint AS monthly_krw
    FROM purchases
    CROSS JOIN window_kst w
    `,
    [JSON.stringify(priceMap)],
  );

  const row = result.rows[0] || {};
  return {
    dailyKrw: Number(row.daily_krw || 0),
    weeklyKrw: Number(row.weekly_krw || 0),
    monthlyKrw: Number(row.monthly_krw || 0),
  };
}

export async function getAdminDashboardPayload(daysInput: number): Promise<AdminDashboardPayload> {
  const days = clampDays(daysInput);
  const rows = await getKpiTableRows(days);
  const pool = getDbPool();
  const todayResult = await pool.query(
    `SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date AS today_kst`,
  );
  const todayKst = String(todayResult.rows[0]?.today_kst || "");
  const previousDayKst = shiftDate(todayKst, -1);

  const [today, previousDay, responseTrend, diagnosticsSummary, diagnosticsByPath, diagnosticsErrorTrend, revenue] = await Promise.all([
    getDailySnapshot(todayKst),
    getDailySnapshot(previousDayKst),
    getResponseTrendByHour(days),
    getDiagnosticsSummary(days),
    getDiagnosticsByPath(days),
    getDiagnosticsErrorTrendByHour(days),
    getRevenueSummary(),
  ]);

  return {
    days,
    generatedAt: new Date().toISOString(),
    rows,
    today,
    previousDay,
    responseTrend,
    diagnosticsSummary,
    diagnosticsByPath,
    diagnosticsErrorTrend,
    revenue,
  };
}
