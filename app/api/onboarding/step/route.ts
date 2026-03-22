import { NextRequest, NextResponse } from "next/server";
import { getDbPool, isDatabaseConfigured } from "@/lib/server/db";

type StepBody = {
  sessionId?: string;
  step?: number;
  data?: unknown;
};

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip")?.trim() || null;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS bogopa.onboarding_steps (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  step SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 4),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, step)
);
`;

const CREATE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;
`;

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL이 설정되지 않았습니다." }, { status: 500 });
  }

  const body = (await request.json()) as StepBody;
  const sessionId = body.sessionId?.trim();
  const step = body.step;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
  }

  if (step !== 1 && step !== 2 && step !== 3 && step !== 4) {
    return NextResponse.json({ error: "step은 1~4만 허용됩니다." }, { status: 400 });
  }

  const pool = getDbPool();

  try {
    await pool.query(CREATE_SCHEMA_SQL);
    await pool.query(CREATE_TABLE_SQL);

    const now = new Date().toISOString();
    const clientIp = getClientIp(request);
    let dataToSave = body.data ?? {};

    if (step === 4 && body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
      const raw = body.data as Record<string, unknown>;
      const consentRaw =
        raw.consent && typeof raw.consent === "object" && !Array.isArray(raw.consent)
          ? (raw.consent as Record<string, unknown>)
          : null;

      dataToSave = {
        ...raw,
        consent_timestamp: (raw.consent_timestamp as string | undefined) || (consentRaw?.consent_timestamp as string | undefined) || undefined,
        consent_ip: raw.consent_ip ?? null,
        is_raw_data_deleted: Boolean(raw.is_raw_data_deleted),
      };

      if (consentRaw) {
        const nextConsentTimestamp =
          (consentRaw.consent_timestamp as string | undefined) || (raw.consent_timestamp as string | undefined) || now;
        dataToSave = {
          ...(dataToSave as Record<string, unknown>),
          consent: {
            ...consentRaw,
            consent_timestamp: nextConsentTimestamp,
          },
          consent_timestamp: nextConsentTimestamp,
          consent_ip: clientIp,
        };
      }

      if (raw.sensitiveDataClearedAt) {
        dataToSave = {
          ...(dataToSave as Record<string, unknown>),
          is_raw_data_deleted: true,
        };
      }
    }

    await pool.query(
      `
      INSERT INTO bogopa.onboarding_steps (session_id, step, data)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (session_id, step)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      [sessionId, step, JSON.stringify(dataToSave)],
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[onboarding-step] save failed", error);
    return NextResponse.json({ error: "온보딩 데이터 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
