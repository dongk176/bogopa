import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getUserProfile, saveUserProfile } from "@/lib/server/user-profile";
import { INTEREST_LABEL_SET, MAX_INTEREST_SELECTION, MBTI_OPTIONS } from "@/lib/user-profile/options";

type ProfileSaveBody = {
  name?: string;
  birthDate?: string;
  gender?: string;
  mbti?: string;
  interests?: string[];
};

const MBTI_SET = new Set<string>(MBTI_OPTIONS);
const MAX_INTEREST_COUNT = MAX_INTEREST_SELECTION;

function isValidBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function isAtLeastAge(value: string, minAge: number) {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;

  const today = new Date();
  let age = today.getFullYear() - year;
  const hasBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hasBirthdayThisYear) age -= 1;
  return age >= minAge;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const profile = await getUserProfile(sessionUser.id);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    console.error("[api-user-profile] failed to load profile", error);
    return NextResponse.json({ error: "사용자 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ProfileSaveBody;

  const name = body.name?.trim() || "";
  const birthDate = body.birthDate?.trim() || "";
  const gender =
    body.gender === "male" || body.gender === "female" || body.gender === "other"
      ? body.gender
      : "";
  const mbti = body.mbti?.trim().toUpperCase() || "";
  const interests = Array.isArray(body.interests)
    ? body.interests.flatMap((item) => {
        const normalized = typeof item === "string" ? item.trim() : "";
        if (!normalized) return [];
        if (normalized === "영화/드라마" || normalized === "movie_drama") {
          return ["영화", "드라마"];
        }
        return [normalized];
      })
    : [];
  const dedupedInterests = Array.from(new Set(interests));

  if (!name || name.length > 30) {
    return NextResponse.json({ error: "이름은 1~30자로 입력해주세요." }, { status: 400 });
  }
  if (!isValidBirthDate(birthDate)) {
    return NextResponse.json({ error: "생년월일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!isAtLeastAge(birthDate, 14)) {
    return NextResponse.json({ error: "만 14세 이상만 사용가능합니다." }, { status: 400 });
  }
  if (!gender) {
    return NextResponse.json({ error: "성별을 선택해주세요." }, { status: 400 });
  }
  if (!MBTI_SET.has(mbti)) {
    return NextResponse.json({ error: "MBTI를 올바르게 선택해주세요." }, { status: 400 });
  }
  if (dedupedInterests.length === 0) {
    return NextResponse.json({ error: "관심사를 1개 이상 선택해주세요." }, { status: 400 });
  }
  if (dedupedInterests.length > MAX_INTEREST_COUNT) {
    return NextResponse.json(
      { error: `관심사는 최대 ${MAX_INTEREST_COUNT}개까지 선택할 수 있습니다.` },
      { status: 400 },
    );
  }
  if (dedupedInterests.some((item) => !INTEREST_LABEL_SET.has(item))) {
    return NextResponse.json({ error: "관심사 값이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    await saveUserProfile({
      userId: sessionUser.id,
      name,
      birthDate,
      gender,
      mbti,
      interests: dedupedInterests,
      provider: typeof sessionUser.provider === "string" ? sessionUser.provider : null,
    });

    const profile = await getUserProfile(sessionUser.id);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    console.error("[api-user-profile] failed to save profile", error);
    return NextResponse.json({ error: "사용자 정보를 저장하지 못했습니다." }, { status: 500 });
  }
}
