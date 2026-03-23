import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
        const url = request.nextUrl.searchParams.get("url");
        if (!url) return new NextResponse("Missing url parameter", { status: 400 });

        const keyMatch = url.match(/(bogopa\/persona\/.*)$/);
        if (!keyMatch) {
            return NextResponse.redirect(url, 307);
        }
        const key = keyMatch[1];

        if (!BUCKET || !REGION) {
            console.warn("[image-proxy] S3 not configured, redirecting to original url");
            return NextResponse.redirect(url, 307);
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        const presignedUrl = await getSignedUrl(getS3(), command, { expiresIn: 3600 });
        return NextResponse.redirect(presignedUrl, 307);
    } catch (error) {
        console.error("[image-proxy] error generating presigned url", error);
        const fallbackUrl = request.nextUrl.searchParams.get("url");
        if (fallbackUrl) return NextResponse.redirect(fallbackUrl, 307);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
