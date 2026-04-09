import { createHash, X509Certificate } from "crypto";
import {
  decodeProtectedHeader,
  importPKCS8,
  importX509,
  jwtVerify,
  SignJWT,
} from "jose";
import { getIapCatalog } from "@/lib/iap/catalog";
import { getDbPool } from "@/lib/server/db";
import { applyVerifiedIapPurchase, ensureIapTables } from "@/lib/server/iap";

type AppleServerNotificationPayload = {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  signedDate?: number;
  data?: {
    environment?: string;
    bundleId?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    status?: number;
  };
};

type AppleSignedTransactionPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  bundleId?: string;
  environment?: string;
  signedDate?: number;
};

type AppleSignedRenewalPayload = {
  autoRenewStatus?: number;
  productId?: string;
  originalTransactionId?: string;
  environment?: string;
  signedDate?: number;
};

type AppleSubscriptionLookupResponse = {
  environment?: string;
  bundleId?: string;
  data?: Array<{
    lastTransactions?: Array<{
      status?: number;
      originalTransactionId?: string;
      signedTransactionInfo?: string;
      signedRenewalInfo?: string;
    }>;
  }>;
};

type NotificationProcessResult = {
  ok: true;
  idempotent: boolean;
  notificationUUID: string;
  notificationType: string;
  subtype: string;
  originalTransactionId: string | null;
  transactionId: string | null;
  userId: string | null;
};

const CREATE_APPLE_SUBSCRIPTION_TABLES_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.apple_notification_events (
  id BIGSERIAL PRIMARY KEY,
  notification_uuid VARCHAR(128) NOT NULL UNIQUE,
  notification_type VARCHAR(64) NOT NULL,
  subtype VARCHAR(64),
  original_transaction_id VARCHAR(256),
  signed_date_ms BIGINT,
  environment VARCHAR(32),
  bundle_id VARCHAR(255),
  signed_payload TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_processed BOOLEAN NOT NULL DEFAULT FALSE,
  process_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apple_notification_events_original_tx
  ON bogopa.apple_notification_events (original_transaction_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bogopa.apple_subscriptions (
  original_transaction_id VARCHAR(256) PRIMARY KEY,
  user_id VARCHAR,
  product_id VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  environment VARCHAR(32),
  bundle_id VARCHAR(255),
  expires_at TIMESTAMPTZ,
  auto_renew_status VARCHAR(32),
  last_transaction_id VARCHAR(256),
  last_notification_type VARCHAR(64),
  last_notification_subtype VARCHAR(64),
  last_signed_date_ms BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apple_subscriptions_user_updated
  ON bogopa.apple_subscriptions (user_id, updated_at DESC);
`;

let ensureAppleSubscriptionPromise: Promise<void> | null = null;

function normalizeNonEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function normalizeIsoFromMillis(value: unknown): string | null {
  const ms = normalizeOptionalInt(value);
  if (!ms || ms <= 0) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toPemFromBase64Cert(base64Cert: string) {
  const chunks = base64Cert.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${chunks.join("\n")}\n-----END CERTIFICATE-----`;
}

function normalizeMultilinePem(raw: string) {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function splitPemCertificates(raw: string) {
  const normalized = normalizeMultilinePem(raw);
  const matches = normalized.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  return matches || [];
}

function shouldSkipCertificateChainValidation() {
  return process.env.NODE_ENV !== "production" && process.env.APPLE_IAP_DISABLE_CERT_CHAIN_VALIDATION === "true";
}

function loadTrustedAppleRoots() {
  const raw = normalizeNonEmpty(process.env.APPLE_IAP_ROOT_CA_PEM);
  if (!raw) return [] as X509Certificate[];
  const pemList = splitPemCertificates(raw);
  return pemList.map((pem) => new X509Certificate(pem));
}

function assertCertificateTimeValidity(
  cert: X509Certificate,
  issuedAtMs: number,
  label: string,
) {
  const notBefore = new Date(cert.validFrom).getTime();
  const notAfter = new Date(cert.validTo).getTime();
  if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter)) {
    throw new Error(`APPLE_JWS_CERT_TIME_INVALID_${label}`);
  }
  if (issuedAtMs < notBefore || issuedAtMs > notAfter) {
    throw new Error(`APPLE_JWS_CERT_EXPIRED_OR_NOT_YET_VALID_${label}`);
  }
}

function assertIssuedBy(child: X509Certificate, issuer: X509Certificate, label: string) {
  if (child.issuer !== issuer.subject) {
    throw new Error(`APPLE_JWS_CERT_ISSUER_MISMATCH_${label}`);
  }
  if (!child.verify(issuer.publicKey)) {
    throw new Error(`APPLE_JWS_CERT_SIGNATURE_INVALID_${label}`);
  }
}

function validateX5cChainAgainstTrustedRoots(input: {
  x5c: string[];
  issuedAtMs: number;
}) {
  if (input.x5c.length === 0) throw new Error("APPLE_JWS_CERT_MISSING");

  const chain = input.x5c.map((certBase64) => new X509Certificate(toPemFromBase64Cert(certBase64)));

  for (let i = 0; i < chain.length; i += 1) {
    assertCertificateTimeValidity(chain[i], input.issuedAtMs, `CHAIN_${i}`);
  }
  for (let i = 0; i + 1 < chain.length; i += 1) {
    assertIssuedBy(chain[i], chain[i + 1], `${i}_TO_${i + 1}`);
  }

  const trustedRoots = loadTrustedAppleRoots();
  if (trustedRoots.length === 0) {
    throw new Error("APPLE_TRUSTED_ROOT_MISSING");
  }

  const chainTail = chain[chain.length - 1];
  let anchored = false;

  for (const root of trustedRoots) {
    assertCertificateTimeValidity(root, input.issuedAtMs, "ROOT");

    const exactRootIncluded =
      chainTail.fingerprint256 === root.fingerprint256 ||
      chainTail.raw.equals(root.raw);
    if (exactRootIncluded) {
      anchored = true;
      break;
    }

    const signedByRoot =
      chainTail.issuer === root.subject && chainTail.verify(root.publicKey);
    if (signedByRoot) {
      anchored = true;
      break;
    }
  }

  if (!anchored) {
    throw new Error("APPLE_JWS_CERT_CHAIN_UNTRUSTED");
  }
}

async function verifyAndDecodeAppleJws<T extends Record<string, unknown>>(signedJws: string): Promise<T> {
  const compact = normalizeNonEmpty(signedJws);
  if (!compact) throw new Error("APPLE_JWS_EMPTY");

  const header = decodeProtectedHeader(compact);
  if (header.alg !== "ES256") {
    throw new Error("APPLE_JWS_UNSUPPORTED_ALG");
  }

  const x5c = Array.isArray(header.x5c) ? header.x5c : [];
  if (x5c.length === 0 || typeof x5c[0] !== "string") {
    throw new Error("APPLE_JWS_CERT_MISSING");
  }

  if (!shouldSkipCertificateChainValidation()) {
    validateX5cChainAgainstTrustedRoots({
      x5c: x5c.filter((item): item is string => typeof item === "string"),
      issuedAtMs: Date.now(),
    });
  }

  const key = await importX509(toPemFromBase64Cert(x5c[0]), "ES256");
  const verified = await jwtVerify(compact, key, {
    algorithms: ["ES256"],
  });

  return (verified.payload || {}) as T;
}

function expectedAppleBundleIds() {
  const ids = [
    process.env.APPLE_IAP_BUNDLE_ID,
    process.env.NEXT_PUBLIC_BUNDLE_ID,
    process.env.NEXT_PUBLIC_IOS_BUNDLE_ID,
  ]
    .map((value) => normalizeNonEmpty(value))
    .filter(Boolean);

  return new Set(ids);
}

function normalizeAppleEnvironment(value: unknown): "Sandbox" | "Production" | "" {
  const raw = normalizeNonEmpty(value).toLowerCase();
  if (raw === "sandbox") return "Sandbox";
  if (raw === "production") return "Production";
  return "";
}

function expectedAppleEnvironment() {
  const fromEnv =
    normalizeAppleEnvironment(process.env.APPLE_IAP_ENVIRONMENT) ||
    normalizeAppleEnvironment(process.env.IAP_APPLE_ENVIRONMENT);
  return fromEnv;
}

function deriveNotificationUuid(notification: AppleServerNotificationPayload, signedPayload: string) {
  const raw = normalizeNonEmpty(notification.notificationUUID);
  if (raw) return raw;
  return createHash("sha256").update(signedPayload).digest("hex");
}

function isMemoryPassProduct(productId: string) {
  const normalized = normalizeNonEmpty(productId);
  if (!normalized) return false;

  const target = getIapCatalog().find((item) => item.key === "memory_pass_monthly");
  if (!target) return false;
  return target.iosProductId === normalized;
}

function resolveSubscriptionStatus(input: {
  notificationType: string;
  subtype: string;
  statusCode: number | null;
}): "active" | "inactive" | "unknown" {
  if (input.statusCode !== null) {
    if (input.statusCode === 1 || input.statusCode === 4) return "active";
    if (input.statusCode === 2 || input.statusCode === 3 || input.statusCode === 5) return "inactive";
  }

  if (input.notificationType === "SUBSCRIBED" || input.notificationType === "DID_RENEW" || input.notificationType === "DID_RECOVER") {
    return "active";
  }

  if (input.notificationType === "DID_FAIL_TO_RENEW" && input.subtype === "GRACE_PERIOD") {
    return "active";
  }

  if (
    input.notificationType === "EXPIRED" ||
    input.notificationType === "REVOKE" ||
    input.notificationType === "REFUND" ||
    input.notificationType === "GRACE_PERIOD_EXPIRED"
  ) {
    return "inactive";
  }

  return "unknown";
}

function shouldApplyRenewalGrant(notificationType: string) {
  // Webhook inserts/uses the transaction before client verify.
  // Because 'user_iap_purchases' UPSERT uses the same user_id, it safely returns idempotent = true for the client.
  // Therefore, it's safe to grant on SUBSCRIBED to handle out-of-app Sandbox resubscribes.
  return (
    notificationType === "DID_RENEW" ||
    notificationType === "DID_RECOVER" ||
    notificationType === "INTERACTIVE_RENEWAL" ||
    notificationType === "SUBSCRIBED"
  );
}

function shouldSyncEntitlementFlag(notificationType: string) {
  // SUBSCRIBED is finalized by in-app verify flow.
  // Avoid flipping flags here to prevent cross-account races when
  // original_transaction_id ownership is being transferred.
  return notificationType !== "SUBSCRIBED";
}

async function ensureUserEntitlementRow(userId: string) {
  const pool = getDbPool();
  await pool.query(
    `
    INSERT INTO bogopa.user_entitlements (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );
}

async function setMemoryPassActiveFlag(userId: string, active: boolean) {
  await ensureUserEntitlementRow(userId);
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE bogopa.user_entitlements
    SET is_memory_pass_active = $2, updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId, active],
  );
}

async function resolveUserIdByOriginalTransactionId(originalTransactionId: string) {
  const normalized = normalizeNonEmpty(originalTransactionId);
  if (!normalized) return null;

  await ensureIapTables();
  const pool = getDbPool();
  const res = await pool.query(
    `
    SELECT user_id
    FROM bogopa.user_iap_purchases
    WHERE (store_original_transaction_id = $1 OR store_transaction_id = $1)
      AND product_key = 'memory_pass_monthly'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [normalized],
  );

  const userId = normalizeNonEmpty(res.rows[0]?.user_id);
  return userId || null;
}

async function upsertAppleSubscriptionState(input: {
  originalTransactionId: string;
  userId: string | null;
  productId: string;
  status: "active" | "inactive" | "unknown";
  environment: string;
  bundleId: string;
  expiresAtIso: string | null;
  autoRenewStatus: string | null;
  transactionId: string;
  notificationType: string;
  subtype: string;
  signedDateMs: number;
}) {
  const pool = getDbPool();

  await pool.query(
    `
    INSERT INTO bogopa.apple_subscriptions (
      original_transaction_id,
      user_id,
      product_id,
      status,
      environment,
      bundle_id,
      expires_at,
      auto_renew_status,
      last_transaction_id,
      last_notification_type,
      last_notification_subtype,
      last_signed_date_ms,
      updated_at
    )
    VALUES (
      $1,
      NULLIF($2, ''),
      NULLIF($3, ''),
      $4,
      NULLIF($5, ''),
      NULLIF($6, ''),
      $7::timestamptz,
      NULLIF($8, ''),
      NULLIF($9, ''),
      NULLIF($10, ''),
      NULLIF($11, ''),
      $12,
      NOW()
    )
    ON CONFLICT (original_transaction_id)
    DO UPDATE SET
      user_id = COALESCE(NULLIF(EXCLUDED.user_id, ''), bogopa.apple_subscriptions.user_id),
      product_id = COALESCE(NULLIF(EXCLUDED.product_id, ''), bogopa.apple_subscriptions.product_id),
      status = CASE
        WHEN bogopa.apple_subscriptions.last_signed_date_ms IS NULL OR EXCLUDED.last_signed_date_ms >= bogopa.apple_subscriptions.last_signed_date_ms
          THEN EXCLUDED.status
        ELSE bogopa.apple_subscriptions.status
      END,
      environment = CASE
        WHEN bogopa.apple_subscriptions.last_signed_date_ms IS NULL OR EXCLUDED.last_signed_date_ms >= bogopa.apple_subscriptions.last_signed_date_ms
          THEN COALESCE(NULLIF(EXCLUDED.environment, ''), bogopa.apple_subscriptions.environment)
        ELSE bogopa.apple_subscriptions.environment
      END,
      bundle_id = CASE
        WHEN bogopa.apple_subscriptions.last_signed_date_ms IS NULL OR EXCLUDED.last_signed_date_ms >= bogopa.apple_subscriptions.last_signed_date_ms
          THEN COALESCE(NULLIF(EXCLUDED.bundle_id, ''), bogopa.apple_subscriptions.bundle_id)
        ELSE bogopa.apple_subscriptions.bundle_id
      END,
      expires_at = CASE
        WHEN bogopa.apple_subscriptions.last_signed_date_ms IS NULL OR EXCLUDED.last_signed_date_ms >= bogopa.apple_subscriptions.last_signed_date_ms
          THEN EXCLUDED.expires_at
        ELSE bogopa.apple_subscriptions.expires_at
      END,
      auto_renew_status = CASE
        WHEN bogopa.apple_subscriptions.last_signed_date_ms IS NULL OR EXCLUDED.last_signed_date_ms >= bogopa.apple_subscriptions.last_signed_date_ms
          THEN COALESCE(NULLIF(EXCLUDED.auto_renew_status, ''), bogopa.apple_subscriptions.auto_renew_status)
        ELSE bogopa.apple_subscriptions.auto_renew_status
      END,
      last_transaction_id = CASE
        WHEN bogopa.apple_subscriptions.last_signed_date_ms IS NULL OR EXCLUDED.last_signed_date_ms >= bogopa.apple_subscriptions.last_signed_date_ms
          THEN COALESCE(NULLIF(EXCLUDED.last_transaction_id, ''), bogopa.apple_subscriptions.last_transaction_id)
        ELSE bogopa.apple_subscriptions.last_transaction_id
      END,
      last_notification_type = CASE
        WHEN bogopa.apple_subscriptions.last_signed_date_ms IS NULL OR EXCLUDED.last_signed_date_ms >= bogopa.apple_subscriptions.last_signed_date_ms
          THEN COALESCE(NULLIF(EXCLUDED.last_notification_type, ''), bogopa.apple_subscriptions.last_notification_type)
        ELSE bogopa.apple_subscriptions.last_notification_type
      END,
      last_notification_subtype = CASE
        WHEN bogopa.apple_subscriptions.last_signed_date_ms IS NULL OR EXCLUDED.last_signed_date_ms >= bogopa.apple_subscriptions.last_signed_date_ms
          THEN COALESCE(NULLIF(EXCLUDED.last_notification_subtype, ''), bogopa.apple_subscriptions.last_notification_subtype)
        ELSE bogopa.apple_subscriptions.last_notification_subtype
      END,
      last_signed_date_ms = GREATEST(
        COALESCE(bogopa.apple_subscriptions.last_signed_date_ms, 0),
        COALESCE(EXCLUDED.last_signed_date_ms, 0)
      ),
      updated_at = NOW()
    `,
    [
      input.originalTransactionId,
      input.userId || "",
      input.productId,
      input.status,
      input.environment,
      input.bundleId,
      input.expiresAtIso,
      input.autoRenewStatus,
      input.transactionId,
      input.notificationType,
      input.subtype,
      input.signedDateMs,
    ],
  );
}

async function markNotificationProcessed(notificationUuid: string, errorMessage?: string | null) {
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE bogopa.apple_notification_events
    SET
      is_processed = $2,
      process_error = NULLIF($3, ''),
      processed_at = NOW(),
      updated_at = NOW()
    WHERE notification_uuid = $1
    `,
    [notificationUuid, errorMessage ? false : true, errorMessage || ""],
  );
}

export async function ensureAppleSubscriptionTables() {
  if (!ensureAppleSubscriptionPromise) {
    ensureAppleSubscriptionPromise = (async () => {
      await ensureIapTables();
      const pool = getDbPool();
      await pool.query(CREATE_APPLE_SUBSCRIPTION_TABLES_SQL);
    })().catch((error) => {
      ensureAppleSubscriptionPromise = null;
      throw error;
    });
  }

  return ensureAppleSubscriptionPromise;
}

function assertAppleNotificationContext(input: { environment: string; bundleId: string }) {
  const expectedBundleSet = expectedAppleBundleIds();
  if (expectedBundleSet.size > 0 && input.bundleId && !expectedBundleSet.has(input.bundleId)) {
    throw new Error("APPLE_NOTIFICATION_BUNDLE_MISMATCH");
  }

  const expectedEnv = expectedAppleEnvironment();
  if (expectedEnv && input.environment && input.environment !== expectedEnv) {
    throw new Error("APPLE_NOTIFICATION_ENV_MISMATCH");
  }
}

function asUpper(value: unknown) {
  return normalizeNonEmpty(value).toUpperCase();
}

function mapAutoRenewStatus(status: number | null): string | null {
  if (status === 1) return "on";
  if (status === 0) return "off";
  return null;
}

export async function processAppleServerNotification(input: {
  signedPayload: string;
}): Promise<NotificationProcessResult> {
  await ensureAppleSubscriptionTables();

  const signedPayload = normalizeNonEmpty(input.signedPayload);
  if (!signedPayload) throw new Error("APPLE_NOTIFICATION_PAYLOAD_REQUIRED");

  const notification = await verifyAndDecodeAppleJws<AppleServerNotificationPayload>(signedPayload);
  const notificationType = asUpper(notification.notificationType) || "UNKNOWN";
  const subtype = asUpper(notification.subtype);
  const notificationUUID = deriveNotificationUuid(notification, signedPayload);

  const signedTransactionInfoRaw = normalizeNonEmpty(notification.data?.signedTransactionInfo);
  const signedRenewalInfoRaw = normalizeNonEmpty(notification.data?.signedRenewalInfo);

  const transactionInfo = signedTransactionInfoRaw
    ? await verifyAndDecodeAppleJws<AppleSignedTransactionPayload>(signedTransactionInfoRaw)
    : ({} as AppleSignedTransactionPayload);
  const renewalInfo = signedRenewalInfoRaw
    ? await verifyAndDecodeAppleJws<AppleSignedRenewalPayload>(signedRenewalInfoRaw)
    : ({} as AppleSignedRenewalPayload);

  const environment =
    normalizeAppleEnvironment(transactionInfo.environment) ||
    normalizeAppleEnvironment(renewalInfo.environment) ||
    normalizeAppleEnvironment(notification.data?.environment);
  const bundleId =
    normalizeNonEmpty(transactionInfo.bundleId) || normalizeNonEmpty(notification.data?.bundleId);

  assertAppleNotificationContext({ environment, bundleId });

  const transactionId = normalizeNonEmpty(transactionInfo.transactionId);
  const originalTransactionId =
    normalizeNonEmpty(transactionInfo.originalTransactionId) || normalizeNonEmpty(renewalInfo.originalTransactionId);
  const productId =
    normalizeNonEmpty(transactionInfo.productId) || normalizeNonEmpty(renewalInfo.productId);

  const statusCode = normalizeOptionalInt(notification.data?.status);
  const signedDateMs =
    normalizeOptionalInt(notification.signedDate) ||
    normalizeOptionalInt(transactionInfo.signedDate) ||
    normalizeOptionalInt(renewalInfo.signedDate) ||
    Date.now();

  const expiresAtIso = normalizeIsoFromMillis(transactionInfo.expiresDate);
  const subscriptionStatus = resolveSubscriptionStatus({
    notificationType,
    subtype,
    statusCode,
  });

  const pool = getDbPool();
  const inserted = await pool.query(
    `
    INSERT INTO bogopa.apple_notification_events (
      notification_uuid,
      notification_type,
      subtype,
      original_transaction_id,
      signed_date_ms,
      environment,
      bundle_id,
      signed_payload,
      payload,
      is_processed,
      process_error,
      updated_at
    )
    VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, NULLIF($6, ''), NULLIF($7, ''), $8, $9::jsonb, FALSE, NULL, NOW())
    ON CONFLICT (notification_uuid) DO NOTHING
    RETURNING id
    `,
    [
      notificationUUID,
      notificationType,
      subtype,
      originalTransactionId,
      signedDateMs,
      environment,
      bundleId,
      signedPayload,
      JSON.stringify(notification),
    ],
  );

  if (!inserted.rows[0]) {
    const resolvedUserId = originalTransactionId
      ? await resolveUserIdByOriginalTransactionId(originalTransactionId)
      : null;

    return {
      ok: true,
      idempotent: true,
      notificationUUID,
      notificationType,
      subtype,
      originalTransactionId: originalTransactionId || null,
      transactionId: transactionId || null,
      userId: resolvedUserId,
    };
  }

  try {
    const userId = originalTransactionId
      ? await resolveUserIdByOriginalTransactionId(originalTransactionId)
      : null;

    if (userId && productId && isMemoryPassProduct(productId)) {
      if (shouldApplyRenewalGrant(notificationType) && transactionId) {
        await applyVerifiedIapPurchase({
          userId,
          platform: "ios",
          productId,
          transactionId,
          originalTransactionId,
          purchasedAt: normalizeIsoFromMillis(transactionInfo.purchaseDate) || undefined,
          rawPayload: {
            source: "app_store_server_notification",
            notificationType,
            subtype,
            notificationUUID,
            signedDate: signedDateMs,
          },
        });
      }

      if (shouldSyncEntitlementFlag(notificationType)) {
        if (subscriptionStatus === "active") {
          await setMemoryPassActiveFlag(userId, true);
        } else if (subscriptionStatus === "inactive") {
          await setMemoryPassActiveFlag(userId, false);
        }
      }
    }

    if (originalTransactionId) {
      await upsertAppleSubscriptionState({
        originalTransactionId,
        userId,
        productId,
        status: subscriptionStatus,
        environment,
        bundleId,
        expiresAtIso,
        autoRenewStatus: mapAutoRenewStatus(normalizeOptionalInt(renewalInfo.autoRenewStatus)),
        transactionId,
        notificationType,
        subtype,
        signedDateMs,
      });
    }

    await markNotificationProcessed(notificationUUID, null);

    return {
      ok: true,
      idempotent: false,
      notificationUUID,
      notificationType,
      subtype,
      originalTransactionId: originalTransactionId || null,
      transactionId: transactionId || null,
      userId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "APPLE_NOTIFICATION_PROCESS_FAILED";
    await markNotificationProcessed(notificationUUID, message);
    throw error;
  }
}

function normalizeApplePrivateKey(raw: string) {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

async function createAppleApiJwt() {
  const issuerId = normalizeNonEmpty(process.env.APPLE_IAP_ISSUER_ID);
  const keyId = normalizeNonEmpty(process.env.APPLE_IAP_KEY_ID);
  const privateKeyRaw = normalizeNonEmpty(process.env.APPLE_IAP_PRIVATE_KEY);
  const bundleId = normalizeNonEmpty(process.env.APPLE_IAP_BUNDLE_ID);

  if (!issuerId || !keyId || !privateKeyRaw || !bundleId) {
    throw new Error("APPLE_API_CREDENTIALS_MISSING");
  }

  const privateKey = await importPKCS8(normalizeApplePrivateKey(privateKeyRaw), "ES256");
  return new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function appleServerApiBaseUrls() {
  const env = expectedAppleEnvironment();
  if (env === "Sandbox") return ["https://api.storekit-sandbox.itunes.apple.com"];
  if (env === "Production") return ["https://api.storekit.itunes.apple.com"];
  return [
    "https://api.storekit.itunes.apple.com",
    "https://api.storekit-sandbox.itunes.apple.com",
  ];
}

async function fetchAppleSubscriptionSnapshot(originalTransactionId: string) {
  const token = await createAppleApiJwt();
  const endpoints = appleServerApiBaseUrls();
  let lastError = "APPLE_API_UNKNOWN_ERROR";

  for (const baseUrl of endpoints) {
    const url = `${baseUrl}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const json = (await response.json().catch(() => ({}))) as AppleSubscriptionLookupResponse & {
      errorCode?: number;
      errorMessage?: string;
    };

    if (response.ok) return json;
    lastError = normalizeNonEmpty(json.errorMessage) || `APPLE_API_HTTP_${response.status}`;
  }

  throw new Error(lastError);
}

type SyncSummary = {
  ok: true;
  scanned: number;
  granted: number;
  activated: number;
  deactivated: number;
  errors: number;
};

function summarizeStatusFromApple(statusCode: number | null): "active" | "inactive" | "unknown" {
  if (statusCode === 1 || statusCode === 4) return "active";
  if (statusCode === 2 || statusCode === 3 || statusCode === 5) return "inactive";
  return "unknown";
}

async function resolveOriginalTransactionsForSync(limit: number) {
  await ensureAppleSubscriptionTables();
  const pool = getDbPool();

  const tracked = await pool.query(
    `
    SELECT original_transaction_id
    FROM bogopa.apple_subscriptions
    WHERE original_transaction_id IS NOT NULL AND original_transaction_id <> ''
    ORDER BY updated_at DESC
    LIMIT $1
    `,
    [limit],
  );

  const trackedIds = tracked.rows
    .map((row) => normalizeNonEmpty(row.original_transaction_id))
    .filter(Boolean);

  if (trackedIds.length > 0) return trackedIds;

  const fallback = await pool.query(
    `
    SELECT DISTINCT store_original_transaction_id AS original_transaction_id
    FROM bogopa.user_iap_purchases
    WHERE product_key = 'memory_pass_monthly'
      AND store_original_transaction_id IS NOT NULL
      AND store_original_transaction_id <> ''
    ORDER BY store_original_transaction_id DESC
    LIMIT $1
    `,
    [limit],
  );

  return fallback.rows
    .map((row) => normalizeNonEmpty(row.original_transaction_id))
    .filter(Boolean);
}

export async function syncAppleSubscriptionStatuses(options?: {
  limit?: number;
}): Promise<SyncSummary> {
  const limit = Math.max(1, Math.min(500, Number(options?.limit || 100)));
  const originalTransactionIds = await resolveOriginalTransactionsForSync(limit);

  let granted = 0;
  let activated = 0;
  let deactivated = 0;
  let errors = 0;

  for (const originalTransactionId of originalTransactionIds) {
    try {
      const snapshot = await fetchAppleSubscriptionSnapshot(originalTransactionId);
      const allLastTransactions = Array.isArray(snapshot.data)
        ? snapshot.data.flatMap((item) => (Array.isArray(item.lastTransactions) ? item.lastTransactions : []))
        : [];

      const parsed = [] as Array<{
        statusCode: number | null;
        transactionId: string;
        productId: string;
        signedDateMs: number;
        purchaseAtIso: string | null;
        expiresAtIso: string | null;
        autoRenewStatus: string | null;
      }>;

      for (const tx of allLastTransactions) {
        const signedTransactionInfo = normalizeNonEmpty(tx.signedTransactionInfo);
        const signedRenewalInfo = normalizeNonEmpty(tx.signedRenewalInfo);

        const transactionInfo = signedTransactionInfo
          ? await verifyAndDecodeAppleJws<AppleSignedTransactionPayload>(signedTransactionInfo)
          : ({} as AppleSignedTransactionPayload);
        const renewalInfo = signedRenewalInfo
          ? await verifyAndDecodeAppleJws<AppleSignedRenewalPayload>(signedRenewalInfo)
          : ({} as AppleSignedRenewalPayload);

        const transactionId = normalizeNonEmpty(transactionInfo.transactionId);
        const productId = normalizeNonEmpty(transactionInfo.productId) || normalizeNonEmpty(renewalInfo.productId);
        const statusCode = normalizeOptionalInt(tx.status);
        const signedDateMs =
          normalizeOptionalInt(transactionInfo.signedDate) ||
          normalizeOptionalInt(renewalInfo.signedDate) ||
          Date.now();

        if (!transactionId || !productId || !isMemoryPassProduct(productId)) continue;

        parsed.push({
          statusCode,
          transactionId,
          productId,
          signedDateMs,
          purchaseAtIso: normalizeIsoFromMillis(transactionInfo.purchaseDate),
          expiresAtIso: normalizeIsoFromMillis(transactionInfo.expiresDate),
          autoRenewStatus: mapAutoRenewStatus(normalizeOptionalInt(renewalInfo.autoRenewStatus)),
        });
      }

      if (parsed.length === 0) continue;

      parsed.sort((a, b) => a.signedDateMs - b.signedDateMs);

      const userId = await resolveUserIdByOriginalTransactionId(originalTransactionId);
      if (userId) {
        for (const item of parsed) {
          if (summarizeStatusFromApple(item.statusCode) === "active") {
            const applied = await applyVerifiedIapPurchase({
              userId,
              platform: "ios",
              productId: item.productId,
              transactionId: item.transactionId,
              originalTransactionId,
              purchasedAt: item.purchaseAtIso || undefined,
              rawPayload: {
                source: "apple_subscription_sync",
                statusCode: item.statusCode,
                signedDateMs: item.signedDateMs,
              },
            });
            if (!applied.idempotent) granted += 1;
          }
        }
      }

      const latest = parsed[parsed.length - 1];
      const latestStatus = summarizeStatusFromApple(latest.statusCode);

      if (originalTransactionId) {
        await upsertAppleSubscriptionState({
          originalTransactionId,
          userId,
          productId: latest.productId,
          status: latestStatus,
          environment: normalizeAppleEnvironment(snapshot.environment),
          bundleId: normalizeNonEmpty(snapshot.bundleId),
          expiresAtIso: latest.expiresAtIso,
          autoRenewStatus: latest.autoRenewStatus,
          transactionId: latest.transactionId,
          notificationType: "SYNC",
          subtype: "",
          signedDateMs: latest.signedDateMs,
        });
      }

      if (userId) {
        if (latestStatus === "active") {
          await setMemoryPassActiveFlag(userId, true);
          activated += 1;
        } else if (latestStatus === "inactive") {
          await setMemoryPassActiveFlag(userId, false);
          deactivated += 1;
        }
      }
    } catch (error) {
      errors += 1;
      console.error("[apple-subscription-sync] failed", {
        originalTransactionId,
        error,
      });
    }
  }

  return {
    ok: true,
    scanned: originalTransactionIds.length,
    granted,
    activated,
    deactivated,
    errors,
  };
}
