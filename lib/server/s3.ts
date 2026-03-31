import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "";
const BUCKET = (process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || "").trim();

let s3Client: S3Client | null = null;

function getS3() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: REGION,
      forcePathStyle: true,
    });
  }
  return s3Client;
}

function getExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] || "";
}

function extensionFromContentType(contentType: string | null) {
  const normalized = (contentType || "").toLowerCase().trim();
  if (!normalized) return ".jpg";
  if (normalized.includes("image/webp")) return ".webp";
  if (normalized.includes("image/png")) return ".png";
  if (normalized.includes("image/gif")) return ".gif";
  if (normalized.includes("image/avif")) return ".avif";
  if (normalized.includes("image/heic")) return ".heic";
  if (normalized.includes("image/heif")) return ".heif";
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) return ".jpg";
  return ".jpg";
}

function buildKey(originalName: string) {
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `bogopa/persona/${yyyy}/${mm}/${randomUUID()}${getExtension(originalName)}`;
}

function buildUserProfileKey(userId: string, contentType: string | null) {
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `bogopa/user-profile/${yyyy}/${mm}/${userId}-${randomUUID()}${extensionFromContentType(contentType)}`;
}

export function isS3Configured() {
  return Boolean(REGION && BUCKET);
}

export async function uploadPersonaImage(file: File) {
  if (!isS3Configured()) {
    throw new Error("S3 설정이 누락되어 있습니다.");
  }

  const key = buildKey(file.name);
  const bytes = await file.arrayBuffer();
  const body = Buffer.from(bytes);

  await getS3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: file.type || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    key,
    url: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`,
  };
}

export async function uploadRemoteProfileImageToS3(input: {
  imageUrl: string;
  userId: string;
}) {
  if (!isS3Configured()) return null;

  const normalizedUrl = input.imageUrl.trim();
  if (!normalizedUrl) return null;

  let response: Response;
  try {
    response = await fetch(normalizedUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().startsWith("image/")) return null;

  const bytes = await response.arrayBuffer();
  const body = Buffer.from(bytes);

  const key = buildUserProfileKey(input.userId, contentType);
  await getS3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    key,
    url: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`,
  };
}
