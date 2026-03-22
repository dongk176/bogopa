import { getDbPool, isDatabaseConfigured } from "@/lib/server/db";

export type StoredReview = {
  id: number;
  nameMasked: string;
  reviewText: string;
  feedbackText: string | null;
  createdAt: string;
};

const CREATE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;
`;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS bogopa.user_reviews (
  id BIGSERIAL PRIMARY KEY,
  name_masked TEXT NOT NULL,
  review_text TEXT NOT NULL CHECK (char_length(review_text) > 0 AND char_length(review_text) < 50),
  feedback_text TEXT NULL,
  source TEXT NOT NULL DEFAULT 'chat_cleanup',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export function maskKoreanName(name: string) {
  const compact = name.replace(/\s+/g, "").trim();
  if (!compact) return "익*명";
  if (compact.length === 1) return `${compact}*`;
  if (compact.length === 2) return `${compact[0]}*`;
  return `${compact[0]}*${compact[compact.length - 1]}`;
}

async function ensureReviewTable() {
  const pool = getDbPool();
  await pool.query(CREATE_SCHEMA_SQL);
  await pool.query(CREATE_TABLE_SQL);
}

export async function insertUserReview(params: { nameMasked: string; reviewText: string; feedbackText?: string | null }) {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL이 설정되지 않았습니다.");
  }

  await ensureReviewTable();
  const pool = getDbPool();

  const reviewText = params.reviewText.trim();
  if (!reviewText || reviewText.length >= 50) {
    throw new Error("후기는 1~49자 범위로 입력해주세요.");
  }

  const nameMasked = (params.nameMasked || "익*명").trim();
  const feedbackText = params.feedbackText?.trim() || null;

  const result = await pool.query<{
    id: string;
    name_masked: string;
    review_text: string;
    feedback_text: string | null;
    created_at: string;
  }>(
    `
    INSERT INTO bogopa.user_reviews (name_masked, review_text, feedback_text)
    VALUES ($1, $2, $3)
    RETURNING id, name_masked, review_text, feedback_text, created_at
    `,
    [nameMasked, reviewText, feedbackText],
  );

  const row = result.rows[0];
  return {
    id: Number(row.id),
    nameMasked: row.name_masked,
    reviewText: row.review_text,
    feedbackText: row.feedback_text,
    createdAt: row.created_at,
  } satisfies StoredReview;
}

export async function listRecentUserReviews(limit = 120): Promise<StoredReview[]> {
  if (!isDatabaseConfigured()) return [];

  await ensureReviewTable();
  const pool = getDbPool();
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(300, Math.floor(limit))) : 120;

  const result = await pool.query<{
    id: string;
    name_masked: string;
    review_text: string;
    feedback_text: string | null;
    created_at: string;
  }>(
    `
    SELECT id, name_masked, review_text, feedback_text, created_at
    FROM bogopa.user_reviews
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [normalizedLimit],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    nameMasked: row.name_masked,
    reviewText: row.review_text,
    feedbackText: row.feedback_text,
    createdAt: row.created_at,
  }));
}

