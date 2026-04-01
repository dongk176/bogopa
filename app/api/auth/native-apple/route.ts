import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { createMobileAuthTransfer } from "@/lib/server/mobile-auth-transfer";
import { upsertUserFromOAuth } from "@/lib/server/user-profile";

type NativeAppleAuthRequestBody = {
  identityToken?: string;
  authorizationCode?: string;
  userIdentifier?: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  nextPath?: string;
};

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function normalizeNextPath(nextPath: string | undefined) {
  const raw = typeof nextPath === "string" ? nextPath.trim() : "";
  if (!raw || !raw.startsWith("/")) return "/";
  if (raw.startsWith("/api/")) return "/";
  if (raw.startsWith("/auth/")) return "/";
  if (raw.startsWith("/signup")) return "/";
  return raw;
}

function toTrimmedString(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

function getCandidateAudiences() {
  const values = [
    process.env.APPLE_NATIVE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    process.env.APPLE_CLIENT_ID,
    "co.kr.bogopa.app",
  ];
  return Array.from(new Set(values.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)));
}

async function verifyAppleIdentityToken(identityToken: string) {
  const audiences = getCandidateAudiences();
  if (audiences.length === 0) {
    throw new Error("Apple audience is not configured.");
  }

  let lastError: unknown = null;
  for (const audience of audiences) {
    try {
      const verified = await jwtVerify(identityToken, APPLE_JWKS, {
        issuer: APPLE_ISSUER,
        audience,
      });
      return verified.payload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Apple identity token verification failed.");
}

function buildDisplayName(body: NativeAppleAuthRequestBody) {
  const given = toTrimmedString(body.givenName);
  const family = toTrimmedString(body.familyName);
  const merged = `${family}${given}`.trim();
  return merged || "사용자";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as NativeAppleAuthRequestBody;

  const identityToken = toTrimmedString(body.identityToken);
  const userIdentifier = toTrimmedString(body.userIdentifier);
  const nextPath = normalizeNextPath(body.nextPath);

  if (!identityToken || !userIdentifier) {
    return NextResponse.json({ error: "Apple 인증 정보가 누락되었습니다." }, { status: 400 });
  }

  try {
    const payload = (await verifyAppleIdentityToken(identityToken)) as JWTPayload & {
      sub?: string;
      email?: string;
    };
    const tokenSubject = toTrimmedString(payload.sub);
    if (!tokenSubject || tokenSubject !== userIdentifier) {
      return NextResponse.json({ error: "Apple 사용자 정보 검증에 실패했습니다." }, { status: 401 });
    }

    const emailFromPayload = toTrimmedString(payload.email);
    const emailFromBody = toTrimmedString(body.email);
    const email = emailFromPayload || emailFromBody || null;
    const name = buildDisplayName(body);

    await upsertUserFromOAuth({
      userId: tokenSubject,
      provider: "apple",
      email,
      name,
      image: null,
    });

    const transfer = await createMobileAuthTransfer({
      userId: tokenSubject,
      nextPath,
    });

    return NextResponse.json({
      ok: true,
      token: transfer.token,
      nextPath: transfer.nextPath,
    });
  } catch (error) {
    console.error("[api-native-apple] failed to process native apple login", error);
    return NextResponse.json({ error: "Apple 로그인 처리에 실패했습니다." }, { status: 500 });
  }
}

