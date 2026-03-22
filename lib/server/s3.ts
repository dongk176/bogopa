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

function buildKey(originalName: string) {
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `bogopa/persona/${yyyy}/${mm}/${randomUUID()}${getExtension(originalName)}`;
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
