import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { extractAvatarStorageKey, isAllowedUploadKey } from "@/lib/avatar-storage";

const REGION = process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "ap-northeast-2";
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

export async function GET(request: NextRequest) {
  try {
        const directKey = request.nextUrl.searchParams.get("key")?.trim() || "";
        const url = request.nextUrl.searchParams.get("url");
        const extractedKey = extractAvatarStorageKey(directKey) || extractAvatarStorageKey(url);
        if (!extractedKey || !isAllowedUploadKey(extractedKey)) {
            return new NextResponse("Invalid image key", { status: 400 });
        }
        const key = extractedKey;

        if (!BUCKET || !REGION) {
            return new NextResponse("S3 not configured", { status: 500 });
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        const presignedUrl = await getSignedUrl(getS3(), command, { expiresIn: 3600 });
        return NextResponse.redirect(presignedUrl, 307);
    } catch (error) {
        console.error("[image-proxy] error generating presigned url", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
