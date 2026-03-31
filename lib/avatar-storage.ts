export type AvatarSource = "default" | "upload" | "external";

const LEGACY_IMG_TO_PROFILE_MAP: Record<string, string> = {
  dad: "/profile/dad.webp",
  mom: "/profile/mom.webp",
  husband: "/profile/husband.webp",
  wife: "/profile/wife.webp",
  "old brother": "/profile/old brother.webp",
  "old sister": "/profile/old sister.webp",
  "young brother": "/profile/young brother.webp",
  "young sister": "/profile/young sister.webp",
};

const ALLOWED_UPLOAD_PREFIXES = ["bogopa/persona/", "bogopa/user-profile/"];

function normalizeHttp(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  return trimmed;
}

function normalizeLegacyProfileImage(path: string) {
  if (!path.startsWith("/img/")) return path;
  const legacyName = decodeURIComponent(path.replace(/^\/img\//, ""))
    .replace(/\.[a-z0-9]+$/i, "")
    .trim()
    .toLowerCase();
  return LEGACY_IMG_TO_PROFILE_MAP[legacyName] ?? "/profile/mom.webp";
}

function safeParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isAllowedUploadKey(key: string) {
  return ALLOWED_UPLOAD_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function buildAvatarProxyUrl(key: string) {
  return `/api/image-proxy?key=${encodeURIComponent(key)}`;
}

export function extractAvatarStorageKey(rawValue: string | null | undefined): string | null {
  const value = (rawValue || "").trim();
  if (!value) return null;

  if (isAllowedUploadKey(value)) return value;

  if (value.startsWith("/api/image-proxy")) {
    const parsed = safeParseUrl(`https://bogopa.local${value}`);
    const key = parsed?.searchParams.get("key")?.trim() || "";
    if (key && isAllowedUploadKey(key)) return key;
    const fromUrl = parsed?.searchParams.get("url")?.trim() || "";
    if (fromUrl) return extractAvatarStorageKey(fromUrl);
    return null;
  }

  const asUrl = safeParseUrl(value);
  if (!asUrl) return null;

  const keyParam = asUrl.searchParams.get("key")?.trim() || "";
  if (keyParam && isAllowedUploadKey(keyParam)) return keyParam;
  const nestedUrl = asUrl.searchParams.get("url")?.trim() || "";
  if (nestedUrl) return extractAvatarStorageKey(nestedUrl);

  const matched = asUrl.pathname.match(/\/(bogopa\/(?:persona|user-profile)\/[^?#]+)/);
  if (!matched?.[1]) return null;
  const key = decodeURIComponent(matched[1]);
  if (!isAllowedUploadKey(key)) return null;
  return key;
}

function normalizeSource(rawSource: string | null | undefined): AvatarSource | null {
  const normalized = (rawSource || "").trim().toLowerCase();
  if (normalized === "default" || normalized === "upload" || normalized === "external") {
    return normalized;
  }
  return null;
}

export function inferAvatarStorage(input: {
  avatarSource?: string | null;
  avatarKey?: string | null;
  avatarUrl?: string | null;
}) {
  const requestedSource = normalizeSource(input.avatarSource);
  const requestedKey = (input.avatarKey || "").trim();
  const requestedUrl = normalizeHttp(input.avatarUrl || "");

  if (requestedSource === "default") {
    const key = normalizeLegacyProfileImage(requestedKey || requestedUrl);
    if (key.startsWith("/")) {
      return { avatarSource: "default" as AvatarSource, avatarKey: key, avatarUrl: key };
    }
  }

  if (requestedSource === "upload") {
    const key = requestedKey || extractAvatarStorageKey(requestedUrl) || "";
    if (key && isAllowedUploadKey(key)) {
      return { avatarSource: "upload" as AvatarSource, avatarKey: key, avatarUrl: buildAvatarProxyUrl(key) };
    }
  }

  if (requestedSource === "external" && requestedUrl) {
    return { avatarSource: "external" as AvatarSource, avatarKey: requestedUrl, avatarUrl: requestedUrl };
  }

  if (requestedUrl.startsWith("/")) {
    const normalized = normalizeLegacyProfileImage(requestedUrl);
    return { avatarSource: "default" as AvatarSource, avatarKey: normalized, avatarUrl: normalized };
  }

  const keyFromUrl = extractAvatarStorageKey(requestedUrl);
  if (keyFromUrl) {
    return { avatarSource: "upload" as AvatarSource, avatarKey: keyFromUrl, avatarUrl: buildAvatarProxyUrl(keyFromUrl) };
  }

  if (requestedKey && isAllowedUploadKey(requestedKey)) {
    return { avatarSource: "upload" as AvatarSource, avatarKey: requestedKey, avatarUrl: buildAvatarProxyUrl(requestedKey) };
  }

  if (requestedUrl) {
    return { avatarSource: "external" as AvatarSource, avatarKey: requestedUrl, avatarUrl: requestedUrl };
  }

  return { avatarSource: null as AvatarSource | null, avatarKey: null as string | null, avatarUrl: null as string | null };
}

export function resolveAvatarUrlFromStorage(input: {
  avatarSource?: string | null;
  avatarKey?: string | null;
  legacyAvatarUrl?: string | null;
}) {
  const source = normalizeSource(input.avatarSource);
  const key = (input.avatarKey || "").trim();
  const legacy = normalizeHttp(input.legacyAvatarUrl || "");

  if (source === "default") {
    const path = normalizeLegacyProfileImage(key || legacy);
    if (path.startsWith("/")) return path;
  }

  if (source === "upload") {
    const uploadKey = key || extractAvatarStorageKey(legacy) || "";
    if (uploadKey && isAllowedUploadKey(uploadKey)) {
      return buildAvatarProxyUrl(uploadKey);
    }
  }

  if (source === "external") {
    if (key) return normalizeHttp(key);
    if (legacy) return normalizeHttp(legacy);
  }

  const inferred = inferAvatarStorage({ avatarUrl: legacy, avatarKey: key });
  return inferred.avatarUrl;
}
