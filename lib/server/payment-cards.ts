import { createHmac } from "crypto";
import { getDbPool } from "@/lib/server/db";

const CREATE_PAYMENT_CARD_TABLE_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.user_payment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  card_alias VARCHAR(40) NOT NULL,
  card_brand VARCHAR(24) NOT NULL,
  card_masked_number VARCHAR(32) NOT NULL,
  card_fingerprint VARCHAR(128) NOT NULL,
  card_pin2_hash VARCHAR(128) NOT NULL,
  holder_birth_hash VARCHAR(128) NOT NULL,
  holder_type VARCHAR(16) NOT NULL CHECK (holder_type IN ('personal', 'corporate')),
  expiry_month SMALLINT NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year SMALLINT NOT NULL CHECK (expiry_year BETWEEN 2000 AND 9999),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, card_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_user_payment_cards_user_id ON bogopa.user_payment_cards (user_id);
`;

let ensurePromise: Promise<void> | null = null;

type HolderType = "personal" | "corporate";

export type PaymentCardInput = {
  cardNumber: string;
  cardPassword2: string;
  expiry: string;
  holderType: HolderType;
  birthDate: string;
  cardAlias: string;
  setAsDefault?: boolean;
};

export type PaymentCardPublic = {
  id: string;
  cardAlias: string;
  cardBrand: string;
  cardMaskedNumber: string;
  holderType: HolderType;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

function getHashSecret() {
  const secret =
    process.env.PAYMENT_CARD_HASH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";

  if (!secret) {
    throw new Error("PAYMENT_CARD_HASH_SECRET 또는 NEXTAUTH_SECRET이 필요합니다.");
  }
  return secret;
}

function hmacHex(value: string) {
  return createHmac("sha256", getHashSecret()).update(value).digest("hex");
}

function normalizeCardNumber(value: string) {
  return value.replace(/\D/g, "");
}

function isValidLuhn(digits: string) {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (!Number.isFinite(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function detectCardBrand(cardDigits: string) {
  if (/^4\d{12}(\d{3}){0,2}$/.test(cardDigits)) return "VISA";
  if (/^(5[1-5]\d{14}|2(2[2-9]|[3-6]\d|7[01])\d{12}|2720\d{12})$/.test(cardDigits)) return "MASTERCARD";
  if (/^3[47]\d{13}$/.test(cardDigits)) return "AMEX";
  if (/^35\d{14,17}$/.test(cardDigits)) return "JCB";
  if (/^62\d{14,17}$/.test(cardDigits)) return "UNIONPAY";
  return "OTHER";
}

function maskCardNumber(cardDigits: string) {
  const last4 = cardDigits.slice(-4);
  return `**** **** **** ${last4}`;
}

function isValidBirthYYMMDD(value: string) {
  if (!/^\d{6}$/.test(value)) return false;
  const yy = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (!Number.isFinite(yy) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const currentYY = new Date().getFullYear() % 100;
  const fullYear = yy <= currentYY ? 2000 + yy : 1900 + yy;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getUTCFullYear() === fullYear &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function parseExpiry(raw: string) {
  const normalized = raw.replace(/\s/g, "");
  const match = normalized.match(/^(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  if (!Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) return null;

  return { month, year };
}

function rowToPublic(row: any): PaymentCardPublic {
  return {
    id: String(row.id),
    cardAlias: String(row.card_alias),
    cardBrand: String(row.card_brand),
    cardMaskedNumber: String(row.card_masked_number),
    holderType: row.holder_type === "corporate" ? "corporate" : "personal",
    expiryMonth: Number(row.expiry_month),
    expiryYear: Number(row.expiry_year),
    isDefault: Boolean(row.is_default),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function ensurePaymentCardTable() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_PAYMENT_CARD_TABLE_SQL);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

export async function listPaymentCardsForUser(userId: string): Promise<PaymentCardPublic[]> {
  await ensurePaymentCardTable();
  const pool = getDbPool();
  const res = await pool.query(
    `
    SELECT
      id,
      card_alias,
      card_brand,
      card_masked_number,
      holder_type,
      expiry_month,
      expiry_year,
      is_default,
      created_at,
      updated_at
    FROM bogopa.user_payment_cards
    WHERE user_id = $1
    ORDER BY is_default DESC, updated_at DESC
    `,
    [userId],
  );
  return res.rows.map(rowToPublic);
}

export async function savePaymentCardForUser(userId: string, input: PaymentCardInput): Promise<PaymentCardPublic> {
  await ensurePaymentCardTable();

  const alias = input.cardAlias.trim();
  if (!alias || alias.length > 40) {
    throw new Error("카드 별명은 1~40자로 입력해주세요.");
  }

  const cardDigits = normalizeCardNumber(input.cardNumber);
  if (cardDigits.length < 14 || cardDigits.length > 19 || !isValidLuhn(cardDigits)) {
    throw new Error("카드 번호 형식이 올바르지 않습니다.");
  }

  const pin2 = input.cardPassword2.trim();
  if (!/^\d{2}$/.test(pin2)) {
    throw new Error("카드 비밀번호 앞 2자리를 정확히 입력해주세요.");
  }

  const holderType: HolderType = input.holderType === "corporate" ? "corporate" : "personal";

  if (!isValidBirthYYMMDD(input.birthDate)) {
    throw new Error("생년월일 6자리(YYMMDD)를 정확히 입력해주세요.");
  }

  const expiry = parseExpiry(input.expiry);
  if (!expiry) {
    throw new Error("유효기간을 MM/YY 형식으로 입력해주세요.");
  }

  const cardBrand = detectCardBrand(cardDigits);
  const cardMaskedNumber = maskCardNumber(cardDigits);
  const cardFingerprint = hmacHex(`pan:${cardDigits}`);
  const cardPin2Hash = hmacHex(`pin2:${userId}:${pin2}`);
  const holderBirthHash = hmacHex(`birth:${userId}:${input.birthDate}`);
  const setAsDefault = Boolean(input.setAsDefault);

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (setAsDefault) {
      await client.query(
        `
        UPDATE bogopa.user_payment_cards
        SET is_default = FALSE, updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId],
      );
    }

    const saved = await client.query(
      `
      WITH has_cards AS (
        SELECT EXISTS(
          SELECT 1 FROM bogopa.user_payment_cards WHERE user_id = $1
        ) AS exists_any
      )
      INSERT INTO bogopa.user_payment_cards (
        user_id,
        card_alias,
        card_brand,
        card_masked_number,
        card_fingerprint,
        card_pin2_hash,
        holder_birth_hash,
        holder_type,
        expiry_month,
        expiry_year,
        is_default
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        CASE WHEN $11 THEN TRUE WHEN (SELECT exists_any FROM has_cards) = FALSE THEN TRUE ELSE FALSE END
      )
      ON CONFLICT (user_id, card_fingerprint)
      DO UPDATE SET
        card_alias = EXCLUDED.card_alias,
        card_brand = EXCLUDED.card_brand,
        card_masked_number = EXCLUDED.card_masked_number,
        card_pin2_hash = EXCLUDED.card_pin2_hash,
        holder_birth_hash = EXCLUDED.holder_birth_hash,
        holder_type = EXCLUDED.holder_type,
        expiry_month = EXCLUDED.expiry_month,
        expiry_year = EXCLUDED.expiry_year,
        is_default = CASE WHEN $11 THEN TRUE ELSE bogopa.user_payment_cards.is_default END,
        updated_at = NOW()
      RETURNING
        id,
        card_alias,
        card_brand,
        card_masked_number,
        holder_type,
        expiry_month,
        expiry_year,
        is_default,
        created_at,
        updated_at
      `,
      [
        userId,
        alias,
        cardBrand,
        cardMaskedNumber,
        cardFingerprint,
        cardPin2Hash,
        holderBirthHash,
        holderType,
        expiry.month,
        expiry.year,
        setAsDefault,
      ],
    );

    await client.query(
      `
      WITH picked AS (
        SELECT id
        FROM bogopa.user_payment_cards
        WHERE user_id = $1
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      )
      UPDATE bogopa.user_payment_cards
      SET is_default = TRUE, updated_at = NOW()
      WHERE user_id = $1
        AND id = (SELECT id FROM picked)
        AND NOT EXISTS (
          SELECT 1 FROM bogopa.user_payment_cards WHERE user_id = $1 AND is_default = TRUE
        )
      `,
      [userId],
    );

    await client.query("COMMIT");
    return rowToPublic(saved.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setDefaultPaymentCardForUser(userId: string, cardId: string): Promise<PaymentCardPublic | null> {
  await ensurePaymentCardTable();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      UPDATE bogopa.user_payment_cards
      SET is_default = FALSE, updated_at = NOW()
      WHERE user_id = $1
      `,
      [userId],
    );

    const updated = await client.query(
      `
      UPDATE bogopa.user_payment_cards
      SET is_default = TRUE, updated_at = NOW()
      WHERE user_id = $1 AND id = $2
      RETURNING
        id,
        card_alias,
        card_brand,
        card_masked_number,
        holder_type,
        expiry_month,
        expiry_year,
        is_default,
        created_at,
        updated_at
      `,
      [userId, cardId],
    );
    await client.query("COMMIT");
    if (updated.rows.length === 0) return null;
    return rowToPublic(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deletePaymentCardForUser(userId: string, cardId: string): Promise<boolean> {
  await ensurePaymentCardTable();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query(
      `
      SELECT is_default
      FROM bogopa.user_payment_cards
      WHERE user_id = $1 AND id = $2
      `,
      [userId, cardId],
    );
    if (target.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const wasDefault = Boolean(target.rows[0]?.is_default);

    await client.query(
      `DELETE FROM bogopa.user_payment_cards WHERE user_id = $1 AND id = $2`,
      [userId, cardId],
    );

    if (wasDefault) {
      await client.query(
        `
        WITH candidate AS (
          SELECT id
          FROM bogopa.user_payment_cards
          WHERE user_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
        )
        UPDATE bogopa.user_payment_cards
        SET is_default = TRUE, updated_at = NOW()
        WHERE id = (SELECT id FROM candidate)
        `,
        [userId],
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
