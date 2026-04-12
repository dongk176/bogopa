import { SignJWT, importPKCS8 } from "jose";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const GOOGLE_ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

type GooglePlayCredentials = {
  packageName: string;
  clientEmail: string;
  privateKey: string;
};

type GooglePlayRequestResult = {
  status: number;
  body: unknown;
  text: string;
  ok: boolean;
};

export type GooglePlayProductVerification = {
  ok: true;
  provider: "android";
  mode: "google_play_api";
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  purchasedAt: string | null;
  purchaseToken: string;
  acknowledgementState: number | null;
  consumptionState: number | null;
  rawPayload: Record<string, unknown>;
};

export type GooglePlaySubscriptionVerification = {
  ok: true;
  provider: "android";
  mode: "google_play_api";
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  purchasedAt: string | null;
  expiresAt: string | null;
  purchaseToken: string;
  subscriptionState: string;
  acknowledgementState: string | null;
  rawPayload: Record<string, unknown>;
};

let tokenCache: { token: string; expiresAtMs: number } | null = null;

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMultilinePem(raw: string) {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readGooglePlayCredentials(): GooglePlayCredentials {
  const packageName = normalizeString(process.env.GOOGLE_PLAY_PACKAGE_NAME) || "co.kr.bogopa.app";

  const inlineJson = normalizeString(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  const parsedJson = inlineJson ? tryParseJson<Record<string, unknown>>(inlineJson) : null;

  const clientEmail =
    normalizeString(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL) ||
    normalizeString(parsedJson?.client_email);

  const privateKeyRaw =
    normalizeString(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY) ||
    normalizeString(parsedJson?.private_key);
  const privateKey = privateKeyRaw ? normalizeMultilinePem(privateKeyRaw) : "";

  if (!clientEmail || !privateKey || !packageName) {
    throw new Error("GOOGLE_PLAY_CREDENTIALS_MISSING");
  }

  return {
    packageName,
    clientEmail,
    privateKey,
  };
}

async function issueGooglePlayAccessToken() {
  const creds = readGooglePlayCredentials();
  const nowSec = Math.floor(Date.now() / 1000);

  const privateKey = await importPKCS8(creds.privateKey, "RS256");
  const assertion = await new SignJWT({ scope: GOOGLE_ANDROID_PUBLISHER_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(creds.clientEmail)
    .setAudience(GOOGLE_OAUTH_TOKEN_URL)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 55 * 60)
    .sign(privateKey);

  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("assertion", assertion);

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const rawText = await response.text();
  const body = tryParseJson<Record<string, unknown>>(rawText) || {};
  if (!response.ok) {
    throw new Error(`GOOGLE_PLAY_TOKEN_REQUEST_FAILED:${response.status}:${rawText}`);
  }

  const accessToken = normalizeString(body.access_token);
  const expiresIn = Number(body.expires_in || 0);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("GOOGLE_PLAY_TOKEN_INVALID");
  }

  tokenCache = {
    token: accessToken,
    expiresAtMs: Date.now() + Math.max(60, expiresIn - 30) * 1000,
  };
  return accessToken;
}

async function getGooglePlayAccessToken() {
  if (tokenCache && tokenCache.expiresAtMs > Date.now()) {
    return tokenCache.token;
  }
  return issueGooglePlayAccessToken();
}

async function googlePlayRequest(
  path: string,
  init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
  allowRetry = true,
): Promise<GooglePlayRequestResult> {
  const accessToken = await getGooglePlayAccessToken();
  const response = await fetch(`${GOOGLE_ANDROID_PUBLISHER_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (allowRetry && response.status === 401) {
    tokenCache = null;
    return googlePlayRequest(path, init, false);
  }

  const text = await response.text();
  const body = tryParseJson<unknown>(text) || {};
  return {
    status: response.status,
    ok: response.ok,
    body,
    text,
  };
}

function normalizeIsoFromMillis(value: unknown): string | null {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
  const date = new Date(asNumber);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeIsoFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function extractGooglePlayErrorCode(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "";
  return normalizeString((error as { status?: unknown }).status);
}

export async function verifyGooglePlayProductPurchase(input: {
  productId: string;
  purchaseToken: string;
}): Promise<GooglePlayProductVerification> {
  const creds = readGooglePlayCredentials();
  const productId = normalizeString(input.productId);
  const purchaseToken = normalizeString(input.purchaseToken);
  if (!productId || !purchaseToken) {
    throw new Error("GOOGLE_PLAY_PRODUCT_VERIFY_INPUT_INVALID");
  }

  const path = `/applications/${encodeURIComponent(creds.packageName)}/purchases/products/${encodeURIComponent(
    productId,
  )}/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await googlePlayRequest(path, { method: "GET" });
  if (!response.ok) {
    throw new Error(`GOOGLE_PLAY_PRODUCT_VERIFY_FAILED:${response.status}:${response.text}`);
  }

  const body = (response.body || {}) as Record<string, unknown>;
  const purchaseState = Number(body.purchaseState ?? -1);
  if (purchaseState !== 0) {
    throw new Error(`GOOGLE_PLAY_PRODUCT_NOT_PURCHASED:${purchaseState}`);
  }

  const responseProductId = normalizeString(body.productId) || productId;
  if (responseProductId !== productId) {
    throw new Error("GOOGLE_PLAY_PRODUCT_ID_MISMATCH");
  }

  const transactionId = normalizeString(body.orderId) || purchaseToken;
  const purchasedAt = normalizeIsoFromMillis(body.purchaseTimeMillis);
  const acknowledgementState = Number.isFinite(Number(body.acknowledgementState))
    ? Number(body.acknowledgementState)
    : null;
  const consumptionState = Number.isFinite(Number(body.consumptionState))
    ? Number(body.consumptionState)
    : null;

  return {
    ok: true,
    provider: "android",
    mode: "google_play_api",
    productId,
    transactionId,
    originalTransactionId: purchaseToken,
    purchasedAt,
    purchaseToken,
    acknowledgementState,
    consumptionState,
    rawPayload: {
      source: "google_play_products_v3",
      packageName: creds.packageName,
      purchaseToken,
      ...body,
    },
  };
}

export async function verifyGooglePlaySubscriptionPurchase(input: {
  productId: string;
  purchaseToken: string;
}): Promise<GooglePlaySubscriptionVerification> {
  const creds = readGooglePlayCredentials();
  const productId = normalizeString(input.productId);
  const purchaseToken = normalizeString(input.purchaseToken);
  if (!productId || !purchaseToken) {
    throw new Error("GOOGLE_PLAY_SUBSCRIPTION_VERIFY_INPUT_INVALID");
  }

  const path = `/applications/${encodeURIComponent(creds.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(
    purchaseToken,
  )}`;
  const response = await googlePlayRequest(path, { method: "GET" });
  if (!response.ok) {
    throw new Error(`GOOGLE_PLAY_SUBSCRIPTION_VERIFY_FAILED:${response.status}:${response.text}`);
  }

  const body = (response.body || {}) as Record<string, unknown>;
  const subscriptionState = normalizeString(body.subscriptionState);
  const activeStates = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"]);
  if (!activeStates.has(subscriptionState)) {
    throw new Error(`GOOGLE_PLAY_SUBSCRIPTION_NOT_ACTIVE:${subscriptionState}`);
  }

  const lineItemsRaw = Array.isArray(body.lineItems) ? (body.lineItems as Array<Record<string, unknown>>) : [];
  const matchedLineItem =
    lineItemsRaw.find((item) => normalizeString(item.productId) === productId) ||
    lineItemsRaw[0] ||
    null;

  const lineItemProductId = normalizeString(matchedLineItem?.productId);
  if (lineItemProductId && lineItemProductId !== productId) {
    throw new Error("GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID_MISMATCH");
  }

  const expiresAt = normalizeIsoFromUnknown(matchedLineItem?.expiryTime);
  const purchasedAt =
    normalizeIsoFromUnknown(matchedLineItem?.latestSuccessfulOrderTime) ||
    normalizeIsoFromUnknown(body.startTime) ||
    null;

  const latestOrderId =
    normalizeString(matchedLineItem?.latestSuccessfulOrderId) || normalizeString(body.latestOrderId);
  const acknowledgementState = normalizeString(body.acknowledgementState) || null;

  return {
    ok: true,
    provider: "android",
    mode: "google_play_api",
    productId,
    transactionId: latestOrderId || purchaseToken,
    originalTransactionId: purchaseToken,
    purchasedAt,
    expiresAt,
    purchaseToken,
    subscriptionState,
    acknowledgementState,
    rawPayload: {
      source: "google_play_subscriptions_v2",
      packageName: creds.packageName,
      purchaseToken,
      ...body,
    },
  };
}

export async function acknowledgeGooglePlaySubscription(input: {
  productId: string;
  purchaseToken: string;
}) {
  const creds = readGooglePlayCredentials();
  const productId = normalizeString(input.productId);
  const purchaseToken = normalizeString(input.purchaseToken);
  if (!productId || !purchaseToken) {
    throw new Error("GOOGLE_PLAY_SUBSCRIPTION_ACK_INPUT_INVALID");
  }

  const path = `/applications/${encodeURIComponent(creds.packageName)}/purchases/subscriptions/${encodeURIComponent(
    productId,
  )}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const response = await googlePlayRequest(path, {
    method: "POST",
    body: JSON.stringify({ developerPayload: "bogopa_subscription_ack" }),
  });

  if (response.ok) return;

  const errorCode = extractGooglePlayErrorCode(response.body);
  // Already acknowledged or token state race.
  if (response.status === 409 || errorCode === "FAILED_PRECONDITION") {
    return;
  }
  throw new Error(`GOOGLE_PLAY_SUBSCRIPTION_ACK_FAILED:${response.status}:${response.text}`);
}

export async function consumeGooglePlayProduct(input: {
  productId: string;
  purchaseToken: string;
}) {
  const creds = readGooglePlayCredentials();
  const productId = normalizeString(input.productId);
  const purchaseToken = normalizeString(input.purchaseToken);
  if (!productId || !purchaseToken) {
    throw new Error("GOOGLE_PLAY_PRODUCT_CONSUME_INPUT_INVALID");
  }

  const path = `/applications/${encodeURIComponent(creds.packageName)}/purchases/products/${encodeURIComponent(
    productId,
  )}/tokens/${encodeURIComponent(purchaseToken)}:consume`;
  const response = await googlePlayRequest(path, {
    method: "POST",
    body: "{}",
  });

  if (response.ok) return;
  // Already consumed / state race.
  if (response.status === 409 || response.status === 410) return;
  throw new Error(`GOOGLE_PLAY_PRODUCT_CONSUME_FAILED:${response.status}:${response.text}`);
}
