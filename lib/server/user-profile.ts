import { getDbPool } from "@/lib/server/db";
import { buildAvatarProxyUrl, extractAvatarStorageKey, inferAvatarStorage, isAllowedUploadKey, resolveAvatarUrlFromStorage } from "@/lib/avatar-storage";
import { isS3Configured, uploadRemoteProfileImageToS3 } from "@/lib/server/s3";

export type UserProfile = {
  userId: string;
  name: string;
  provider: string | null;
  birthDate: string | null;
  gender: "male" | "female" | "other" | null;
  mbti: string | null;
  interests: string[];
  aiDataTransferConsented: boolean;
  aiDataTransferConsentedAt: string | null;
  aiDataTransferConsentVersion: string | null;
  aiDataTransferConsentSource: string | null;
  profileCompleted: boolean;
};

export type UserAuthSnapshot = {
  userId: string;
  name: string;
  email: string | null;
  image: string | null;
};

export type UserAiDataConsent = {
  consented: boolean;
  consentedAt: string | null;
  consentVersion: string | null;
  consentSource: string | null;
};

function normalizeImageUrl(url: string | null | undefined) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  return trimmed;
}

const CREATE_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS bogopa;`;

const CREATE_USERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS bogopa."users" (
  "id" VARCHAR PRIMARY KEY,
  "name" VARCHAR,
  "email" VARCHAR,
  "image" TEXT,
  "image_source" VARCHAR(24),
  "image_key" TEXT,
  "provider" VARCHAR,
  "birth_date" DATE,
  "gender" VARCHAR(16),
  "mbti" VARCHAR(4),
  "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ai_data_transfer_consented" BOOLEAN NOT NULL DEFAULT FALSE,
  "ai_data_transfer_consented_at" TIMESTAMPTZ,
  "ai_data_transfer_consent_version" VARCHAR(32),
  "ai_data_transfer_consent_source" VARCHAR(64),
  "admin" BOOLEAN NOT NULL DEFAULT FALSE,
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
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "image_source" VARCHAR(24);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "image_key" TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "provider" VARCHAR;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "birth_date" DATE;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(16);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "mbti" VARCHAR(4);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "ai_data_transfer_consented" BOOLEAN NOT NULL DEFAULT FALSE;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "ai_data_transfer_consented_at" TIMESTAMPTZ;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "ai_data_transfer_consent_version" VARCHAR(32);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "ai_data_transfer_consent_source" VARCHAR(64);`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "admin" BOOLEAN NOT NULL DEFAULT FALSE;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "profile_completed" BOOLEAN NOT NULL DEFAULT FALSE;`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
      await pool.query(`ALTER TABLE IF EXISTS bogopa."users" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
      await pool.query(`
        UPDATE bogopa."users"
        SET "image_source" = 'default',
            "image_key" = "image"
        WHERE COALESCE("image_source", '') = ''
          AND "image" IS NOT NULL
          AND "image" LIKE '/%';
      `);
      await pool.query(`
        UPDATE bogopa."users"
        SET "image_source" = 'upload',
            "image_key" = substring("image" from '(bogopa/(?:persona|user-profile)/[^?]+)')
        WHERE COALESCE("image_source", '') = ''
          AND "image" IS NOT NULL
          AND "image" ~ 'bogopa/(persona|user-profile)/';
      `);
      await pool.query(`
        UPDATE bogopa."users"
        SET "image_source" = 'external',
            "image_key" = "image"
        WHERE COALESCE("image_source", '') = ''
          AND "image" IS NOT NULL
          AND "image" LIKE 'http%';
      `);
    })().catch((error) => {
      ensureUsersTablePromise = null;
      throw error;
    });
  }

  await ensureUsersTablePromise;
}

async function resolveOAuthImageStorage(input: {
  imageUrl: string | null;
  userId: string;
}) {
  const normalized = normalizeImageUrl(input.imageUrl);
  if (!normalized) {
    return { image: null, imageSource: null as string | null, imageKey: null as string | null };
  }

  const inferred = inferAvatarStorage({ avatarUrl: normalized });
  if (inferred.avatarSource === "upload" && inferred.avatarKey && isAllowedUploadKey(inferred.avatarKey)) {
    return {
      image: buildAvatarProxyUrl(inferred.avatarKey),
      imageSource: "upload",
      imageKey: inferred.avatarKey,
    };
  }

  if (inferred.avatarSource === "default" && inferred.avatarKey) {
    return { image: inferred.avatarUrl, imageSource: "default", imageKey: inferred.avatarKey };
  }

  if (isS3Configured()) {
    const uploaded = await uploadRemoteProfileImageToS3({ imageUrl: normalized, userId: input.userId });
    if (uploaded?.key) {
      return {
        image: buildAvatarProxyUrl(uploaded.key),
        imageSource: "upload",
        imageKey: uploaded.key,
      };
    }
  }

  return {
    image: normalized,
    imageSource: "external",
    imageKey: normalized,
  };
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
  const resolvedImage = await resolveOAuthImageStorage({
    imageUrl: input.image,
    userId: input.userId,
  });

  await pool.query(
    `
    INSERT INTO bogopa."users" ("id", "name", "email", "image", "image_source", "image_key", "provider", "updated_at")
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE
    SET "name" = COALESCE(NULLIF(bogopa."users"."name", ''), EXCLUDED.name),
        "email" = EXCLUDED.email,
        "image" = COALESCE(EXCLUDED.image, bogopa."users"."image"),
        "image_source" = COALESCE(EXCLUDED.image_source, bogopa."users"."image_source"),
        "image_key" = COALESCE(EXCLUDED.image_key, bogopa."users"."image_key"),
        "provider" = EXCLUDED.provider,
        "updated_at" = CURRENT_TIMESTAMP;
    `,
    [
      input.userId,
      input.name,
      input.email,
      resolvedImage.image,
      resolvedImage.imageSource,
      resolvedImage.imageKey,
      input.provider,
    ],
  );

  return {
    userId: input.userId,
    image: resolvedImage.image,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  await ensureUsersTable();
  const pool = getDbPool();

  const res = await pool.query(
    `
    SELECT
      "id",
      "name",
      "provider",
      "birth_date",
      "gender",
      "mbti",
      "interests",
      "ai_data_transfer_consented",
      "ai_data_transfer_consented_at",
      "ai_data_transfer_consent_version",
      "ai_data_transfer_consent_source",
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
      provider: null,
      birthDate: null,
      gender: null,
      mbti: null,
      interests: [],
      aiDataTransferConsented: false,
      aiDataTransferConsentedAt: null,
      aiDataTransferConsentVersion: null,
      aiDataTransferConsentSource: null,
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
  const aiDataTransferConsented = Boolean(row.ai_data_transfer_consented);
  const aiDataTransferConsentedAt = row.ai_data_transfer_consented_at
    ? new Date(row.ai_data_transfer_consented_at).toISOString()
    : null;
  const aiDataTransferConsentVersion =
    typeof row.ai_data_transfer_consent_version === "string" && row.ai_data_transfer_consent_version.trim()
      ? row.ai_data_transfer_consent_version.trim()
      : null;
  const aiDataTransferConsentSource =
    typeof row.ai_data_transfer_consent_source === "string" && row.ai_data_transfer_consent_source.trim()
      ? row.ai_data_transfer_consent_source.trim()
      : null;
  const hasRequiredProfileFields = Boolean(birthDate && gender && mbti && interests.length > 0);

  return {
    userId: String(row.id),
    name: typeof row.name === "string" ? row.name : "",
    provider: typeof row.provider === "string" && row.provider.trim() ? row.provider.trim() : null,
    birthDate,
    gender,
    mbti,
    interests,
    aiDataTransferConsented,
    aiDataTransferConsentedAt,
    aiDataTransferConsentVersion,
    aiDataTransferConsentSource,
    profileCompleted: hasRequiredProfileFields,
  };
}

export async function getUserAuthSnapshot(userId: string): Promise<UserAuthSnapshot | null> {
  await ensureUsersTable();
  const pool = getDbPool();

  const res = await pool.query(
    `
    SELECT "id", "name", "email", "image", "image_source", "image_key"
    FROM bogopa."users"
    WHERE "id" = $1
    LIMIT 1
    `,
    [userId],
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    userId: String(row.id),
    name: typeof row.name === "string" && row.name.trim() ? row.name : "사용자",
    email: typeof row.email === "string" ? row.email : null,
    image: resolveAvatarUrlFromStorage({
      avatarSource: typeof row.image_source === "string" ? row.image_source : null,
      avatarKey:
        typeof row.image_key === "string"
          ? (extractAvatarStorageKey(row.image_key) || row.image_key)
          : null,
      legacyAvatarUrl: normalizeImageUrl(typeof row.image === "string" ? row.image : null),
    }),
  };
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return false;

  await ensureUsersTable();
  const pool = getDbPool();
  const res = await pool.query(
    `
    SELECT COALESCE("admin", FALSE) AS is_admin
    FROM bogopa."users"
    WHERE "id" = $1
    LIMIT 1
    `,
    [normalizedUserId],
  );

  return Boolean(res.rows[0]?.is_admin);
}

export async function saveUserProfile(input: {
  userId: string;
  name: string;
  birthDate: string;
  gender: "male" | "female" | "other";
  mbti: string;
  interests: string[];
  provider?: string | null;
  aiDataTransferConsent?: {
    agreed: boolean;
    version?: string | null;
    source?: string | null;
  };
}) {
  await ensureUsersTable();
  const pool = getDbPool();
  const requestedProvider = typeof input.provider === "string" ? input.provider.trim() : "";

  let provider = requestedProvider;
  if (!provider) {
    const providerRow = await pool.query(
      `
      SELECT "provider"
      FROM bogopa."users"
      WHERE "id" = $1
      LIMIT 1
      `,
      [input.userId],
    );
    const existingProvider = providerRow.rows[0]?.provider;
    provider = typeof existingProvider === "string" ? existingProvider.trim() : "";
  }
  if (!provider) {
    // Keep INSERT safe even when OAuth snapshot row was not created yet.
    provider = "unknown";
  }

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
        "provider" = COALESCE(NULLIF(bogopa."users"."provider", ''), EXCLUDED.provider),
        "birth_date" = EXCLUDED.birth_date,
        "gender" = EXCLUDED.gender,
        "mbti" = EXCLUDED.mbti,
        "interests" = EXCLUDED.interests,
        "profile_completed" = TRUE,
        "updated_at" = CURRENT_TIMESTAMP;
    `,
    [input.userId, input.name, provider, input.birthDate, input.gender, input.mbti, input.interests],
  );

  if (input.aiDataTransferConsent?.agreed) {
    await setUserAiDataConsent({
      userId: input.userId,
      agreed: true,
      version: input.aiDataTransferConsent.version || null,
      source: input.aiDataTransferConsent.source || "signup",
    });
  }
}

export async function getUserAiDataConsent(userId: string): Promise<UserAiDataConsent> {
  await ensureUsersTable();
  const pool = getDbPool();

  const res = await pool.query(
    `
    SELECT
      COALESCE("ai_data_transfer_consented", FALSE) AS consented,
      "ai_data_transfer_consented_at" AS consented_at,
      "ai_data_transfer_consent_version" AS consent_version,
      "ai_data_transfer_consent_source" AS consent_source
    FROM bogopa."users"
    WHERE "id" = $1
    LIMIT 1
    `,
    [userId],
  );

  const row = res.rows[0];
  if (!row) {
    return {
      consented: false,
      consentedAt: null,
      consentVersion: null,
      consentSource: null,
    };
  }

  return {
    consented: Boolean(row.consented),
    consentedAt: row.consented_at ? new Date(row.consented_at).toISOString() : null,
    consentVersion:
      typeof row.consent_version === "string" && row.consent_version.trim() ? row.consent_version.trim() : null,
    consentSource:
      typeof row.consent_source === "string" && row.consent_source.trim() ? row.consent_source.trim() : null,
  };
}

export async function setUserAiDataConsent(input: {
  userId: string;
  agreed: boolean;
  version?: string | null;
  source?: string | null;
}) {
  await ensureUsersTable();
  const pool = getDbPool();

  await pool.query(
    `
    INSERT INTO bogopa."users" (
      "id",
      "ai_data_transfer_consented",
      "ai_data_transfer_consented_at",
      "ai_data_transfer_consent_version",
      "ai_data_transfer_consent_source",
      "updated_at"
    )
    VALUES (
      $1,
      $2,
      CASE WHEN $2 THEN NOW() ELSE NULL END,
      CASE WHEN $2 THEN NULLIF($3, '') ELSE NULL END,
      NULLIF($4, ''),
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("id") DO UPDATE
    SET "ai_data_transfer_consented" = EXCLUDED.ai_data_transfer_consented,
        "ai_data_transfer_consented_at" = EXCLUDED.ai_data_transfer_consented_at,
        "ai_data_transfer_consent_version" = EXCLUDED.ai_data_transfer_consent_version,
        "ai_data_transfer_consent_source" = EXCLUDED.ai_data_transfer_consent_source,
        "updated_at" = CURRENT_TIMESTAMP;
    `,
    [input.userId, input.agreed, input.version || "", input.source || "settings"],
  );

  return getUserAiDataConsent(input.userId);
}
