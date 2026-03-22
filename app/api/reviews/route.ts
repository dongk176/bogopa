import { NextRequest, NextResponse } from "next/server";
import { insertUserReview, listRecentUserReviews, maskKoreanName } from "@/lib/server/reviews";

type ReviewPostBody = {
  name?: string;
  nameMasked?: string;
  review?: string;
  feedback?: string;
};

export async function GET() {
  try {
    const reviews = await listRecentUserReviews(120);
    return NextResponse.json({
      ok: true,
      reviews: reviews.map((item) => ({
        id: item.id,
        name: item.nameMasked,
        text: item.reviewText,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    console.error("[reviews:get] failed", error);
    return NextResponse.json({ error: "후기 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: ReviewPostBody;
  try {
    body = (await request.json()) as ReviewPostBody;
  } catch {
    return NextResponse.json({ error: "요청 본문(JSON)을 해석할 수 없습니다." }, { status: 400 });
  }

  const review = body.review?.trim() || "";
  if (!review || review.length >= 50) {
    return NextResponse.json({ error: "후기는 1~49자로 입력해주세요." }, { status: 400 });
  }

  const nameMasked = (body.nameMasked?.trim() || maskKoreanName(body.name?.trim() || "")).trim() || "익*명";
  const feedback = body.feedback?.trim() || "";

  try {
    const created = await insertUserReview({
      nameMasked,
      reviewText: review,
      feedbackText: feedback || null,
    });

    return NextResponse.json({
      ok: true,
      review: {
        id: created.id,
        name: created.nameMasked,
        text: created.reviewText,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    console.error("[reviews:post] failed", error);
    return NextResponse.json({ error: "후기 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

