import { NextRequest, NextResponse } from "next/server";
import { getDbPool, isDatabaseConfigured } from "@/lib/server/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

type StepBody = {
  sessionId?: string;
  step?: number;
  data?: unknown;
};

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS bogopa.onboarding_steps (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  session_id TEXT,
  step SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 4),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, step)
);
`;

const CREATE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;
`;

let ensureOnboardingTablePromise: Promise<void> | null = null;

async function ensureOnboardingTable() {
  if (!ensureOnboardingTablePromise) {
    ensureOnboardingTablePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_SCHEMA_SQL);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.onboarding_steps ADD COLUMN IF NOT EXISTS user_id VARCHAR;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa.onboarding_steps ALTER COLUMN session_id DROP NOT NULL;`);

      // Create table if it literally doesn't exist
      await pool.query(CREATE_TABLE_SQL);

      // Ensure unique constraint for user_id, drop old if present
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_steps_user_id_step_key') THEN
            ALTER TABLE bogopa.onboarding_steps DROP CONSTRAINT IF EXISTS bogopa_onboarding_steps_session_id_step_key;
            ALTER TABLE bogopa.onboarding_steps DROP CONSTRAINT IF EXISTS onboarding_steps_session_id_step_key;
            ALTER TABLE bogopa.onboarding_steps ADD CONSTRAINT onboarding_steps_user_id_step_key UNIQUE (user_id, step);
          END IF;
        END $$;
      `);

      // Privacy minimization: remove legacy consent_ip fields that are no longer used.
      await pool.query(`
        UPDATE bogopa.onboarding_steps
        SET data = (data #- '{consent_ip}') #- '{consent,consent_ip}'
        WHERE (data ? 'consent_ip')
           OR ((data ? 'consent') AND ((data->'consent') ? 'consent_ip'));
      `);
    })().catch((error) => {
      ensureOnboardingTablePromise = null;
      throw error;
    });
  }
  await ensureOnboardingTablePromise;
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL이 설정되지 않았습니다." }, { status: 500 });
  }

  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const userId = sessionUser.id;
  const body = (await request.json()) as StepBody;
  const sessionId = body.sessionId?.trim() || null;
  const step = body.step;

  if (step !== 1 && step !== 2 && step !== 3) {
    return NextResponse.json({ error: "step은 1~3만 허용됩니다." }, { status: 400 });
  }

  const pool = getDbPool();

  try {
    await ensureOnboardingTable();

    const now = new Date().toISOString();
    let dataToSave = body.data ?? {};

    if (step === 3 && body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
      const raw = body.data as Record<string, unknown>;
      const consentRaw =
        raw.consent && typeof raw.consent === "object" && !Array.isArray(raw.consent)
          ? (raw.consent as Record<string, unknown>)
          : null;

      dataToSave = {
        ...raw,
        consent_timestamp: (raw.consent_timestamp as string | undefined) || (consentRaw?.consent_timestamp as string | undefined) || undefined,
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
      INSERT INTO bogopa.onboarding_steps (user_id, session_id, step, data)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (user_id, step)
      DO UPDATE SET data = EXCLUDED.data, session_id = EXCLUDED.session_id, updated_at = NOW()
      `,
      [userId, sessionId, step, JSON.stringify(dataToSave)],
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[onboarding-step] save failed", error);
    return NextResponse.json({ error: "온보딩 데이터 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
