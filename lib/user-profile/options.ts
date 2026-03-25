export const MBTI_OPTIONS = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const;

export type MbtiOption = (typeof MBTI_OPTIONS)[number];

export const INTEREST_OPTIONS = [
  { key: "daily", label: "일상" },
  { key: "emotion_comfort", label: "감정/위로" },
  { key: "relationship", label: "인간관계" },
  { key: "romance", label: "연애" },
  { key: "family", label: "가족" },
  { key: "friend", label: "친구" },
  { key: "music", label: "음악" },
  { key: "movie", label: "영화" },
  { key: "drama", label: "드라마" },
  { key: "hobby", label: "취미" },
  { key: "travel", label: "여행" },
  { key: "study_career", label: "공부/진로" },
  { key: "work_career", label: "일/커리어" },
  { key: "self_growth", label: "자기계발" },
  { key: "memory", label: "추억" },
  { key: "counseling", label: "고민상담" },
  { key: "small_talk", label: "그냥 수다" },
] as const;

export type InterestKey = (typeof INTEREST_OPTIONS)[number]["key"];

export const INTEREST_LABEL_SET = new Set<string>(INTEREST_OPTIONS.map((item) => item.label));
export const MAX_INTEREST_SELECTION = 5;
