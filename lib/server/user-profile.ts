import { getDbPool } from "@/lib/server/db";

export type UserProfile = {
  userId: string;
  name: string;
  birthDate: string | null;
  gender: "male" | "female" | "other" | null;
  mbti: string | null;
  interests: string[];
  profileCompleted: boolean;
};

const CREATE_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS bogopa;`;

const CREATE_USERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS bogopa."users" (
  "id" VARCHAR PRIMARY KEY,
  "name" VARCHAR,
  "email" VARCHAR,
  "image" TEXT,
  "provider" VARCHAR,
  "birth_date" DATE,
  "gender" VARCHAR(16),
  "mbti" VARCHAR(4),
  "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "profile_completed" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let ensureUsersTablePromise: Promise<void> | null = null;

export async function ensureUsersTable() {
  if (!ensureUsersTablePromise) {
    ensureUsersTablePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_SCHEMA_SQL);
      await pool.query(CREATE_USERS_TABLE_SQL);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "name" VARCHAR;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "email" VARCHAR;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "image" TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "provider" VARCHAR;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "birth_date" DATE;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(16);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "mbti" VARCHAR(4);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "profile_completed" BOOLEAN NOT NULL DEFAULT FALSE;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    })().catch((error) => {
      ensureUsersTablePromise = null;
      throw error;
    });
  }

  await ensureUsersTablePromise;
}

export async function upsertUserFromOAuth(input: {
  userId: string;
  provider: string;
  email: string | null;
  name: string;
  image: string | null;
}) {
  await ensureUsersTable();
  const pool = getDbPool();

  await pool.query(
    `
    INSERT INTO bogopa."users" ("id", "name", "email", "image", "provider", "updated_at")
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE
    SET "name" = COALESCE(NULLIF(bogopa."users"."name", ''), EXCLUDED.name),
        "email" = EXCLUDED.email,
        "image" = EXCLUDED.image,
        "provider" = EXCLUDED.provider,
        "updated_at" = CURRENT_TIMESTAMP;
    `,
    [input.userId, input.name, input.email, input.image, input.provider],
  );
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  await ensureUsersTable();
  const pool = getDbPool();

  const res = await pool.query(
    `
    SELECT
      "id",
      "name",
      "birth_date",
      "gender",
      "mbti",
      "interests",
      "profile_completed"
    FROM bogopa."users"
    WHERE "id" = $1
    `,
    [userId],
  );

  const row = res.rows[0];
  if (!row) {
    return {
      userId,
      name: "",
      birthDate: null,
      gender: null,
      mbti: null,
      interests: [],
      profileCompleted: false,
    };
  }

  let birthDate: string | null = null;
  if (typeof row.birth_date === "string") {
    birthDate = row.birth_date.slice(0, 10);
  } else if (row.birth_date instanceof Date) {
    const year = row.birth_date.getUTCFullYear();
    const month = String(row.birth_date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(row.birth_date.getUTCDate()).padStart(2, "0");
    birthDate = `${year}-${month}-${day}`;
  }

  const gender =
    row.gender === "male" || row.gender === "female" || row.gender === "other"
      ? row.gender
      : null;
  const mbti = typeof row.mbti === "string" && row.mbti ? row.mbti : null;
  const interests = Array.isArray(row.interests)
    ? row.interests.filter((item: unknown) => typeof item === "string")
    : [];
  const hasRequiredProfileFields = Boolean(birthDate && gender && mbti && interests.length > 0);

  return {
    userId: String(row.id),
    name: typeof row.name === "string" ? row.name : "",
    birthDate,
    gender,
    mbti,
    interests,
    profileCompleted: hasRequiredProfileFields,
  };
}

export async function saveUserProfile(input: {
  userId: string;
  name: string;
  birthDate: string;
  gender: "male" | "female" | "other";
  mbti: string;
  interests: string[];
}) {
  await ensureUsersTable();
  const pool = getDbPool();

  await pool.query(
    `
    INSERT INTO bogopa."users" (
      "id",
      "name",
      "provider",
      "birth_date",
      "gender",
      "mbti",
      "interests",
      "profile_completed",
      "updated_at"
    )
    VALUES ($1, $2, $3, $4::date, $5, $6, $7::text[], TRUE, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE
    SET "name" = EXCLUDED.name,
        "birth_date" = EXCLUDED.birth_date,
        "gender" = EXCLUDED.gender,
        "mbti" = EXCLUDED.mbti,
        "interests" = EXCLUDED.interests,
        "profile_completed" = TRUE,
        "updated_at" = CURRENT_TIMESTAMP;
    `,
    [input.userId, input.name, "oauth", input.birthDate, input.gender, input.mbti, input.interests],
  );
}
