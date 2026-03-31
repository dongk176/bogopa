import { NextRequest, NextResponse } from "next/server";
import { isS3Configured, uploadPersonaImage } from "@/lib/server/s3";
import { buildAvatarProxyUrl } from "@/lib/avatar-storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!isS3Configured()) {
    return NextResponse.json({ error: "S3 설정이 누락되어 이미지 업로드를 진행할 수 없습니다." }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
    }

    if (file.size >= MAX_FILE_SIZE) {
      return NextResponse.json({ error: "이미지 파일은 10MB 미만만 업로드할 수 있습니다." }, { status: 400 });
    }

    const uploaded = await uploadPersonaImage(file);
    const proxyUrl = buildAvatarProxyUrl(uploaded.key);
    return NextResponse.json({
      ok: true,
      key: uploaded.key,
      url: proxyUrl,
      avatarSource: "upload",
      avatarKey: uploaded.key,
      avatarUrl: proxyUrl,
    });
  } catch (error) {
    console.error("[persona-image-upload] failed", error);
    return NextResponse.json({ error: "이미지 업로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
