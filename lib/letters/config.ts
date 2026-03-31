export type LetterKind = "morning" | "evening";

export type LetterSettings = {
  enabledKinds: LetterKind[];
  personaId: string | null;
  morningTime: string;
  eveningTime: string;
};

export type LetterInboxItem = {
  id: string;
  kind: LetterKind;
  date: string; // YYYY-MM-DD
  title: string;
  preview: string;
  unread: boolean;
};

export const LETTER_SETTINGS_STORAGE_KEY = "bogopa_letters_settings_v1";

export const DEFAULT_LETTER_SETTINGS: LetterSettings = {
  enabledKinds: ["morning", "evening"],
  personaId: null,
  morningTime: "07:30",
  eveningTime: "22:00",
};

const MOOD_BY_INDEX = [
  "조용히 곁을 지켜주던 마음",
  "다정하게 안부를 건네던 온기",
  "무너지지 않게 잡아주던 말투",
  "가만히 응원해주던 눈빛",
  "힘든 날을 덮어주던 위로",
];

function normalizeSettings(value: Partial<LetterSettings> | null | undefined): LetterSettings {
  const enabledKinds = Array.isArray(value?.enabledKinds)
    ? value!.enabledKinds.filter((item): item is LetterKind => item === "morning" || item === "evening")
    : DEFAULT_LETTER_SETTINGS.enabledKinds;

  return {
    enabledKinds: enabledKinds.length > 0 ? enabledKinds : ["morning"],
    personaId: typeof value?.personaId === "string" && value.personaId.trim().length > 0 ? value.personaId : null,
    morningTime:
      typeof value?.morningTime === "string" && /^\d{2}:\d{2}$/.test(value.morningTime)
        ? value.morningTime
        : DEFAULT_LETTER_SETTINGS.morningTime,
    eveningTime:
      typeof value?.eveningTime === "string" && /^\d{2}:\d{2}$/.test(value.eveningTime)
        ? value.eveningTime
        : DEFAULT_LETTER_SETTINGS.eveningTime,
  };
}

export function loadLetterSettings(): LetterSettings {
  if (typeof window === "undefined") return DEFAULT_LETTER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(LETTER_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_LETTER_SETTINGS;
    return normalizeSettings(JSON.parse(raw) as Partial<LetterSettings>);
  } catch {
    return DEFAULT_LETTER_SETTINGS;
  }
}

export function saveLetterSettings(settings: LetterSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LETTER_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    // Ignore localStorage failures.
  }
}

export function toggleLetterKind(settings: LetterSettings, kind: LetterKind): LetterSettings {
  const current = new Set(settings.enabledKinds);
  if (current.has(kind)) {
    if (current.size === 1) return settings;
    current.delete(kind);
  } else {
    current.add(kind);
  }
  return { ...settings, enabledKinds: Array.from(current) as LetterKind[] };
}

export function describePersonaMood(name: string, index: number) {
  const normalized = name.toLowerCase();
  if (normalized.includes("엄마") || normalized.includes("아빠") || normalized.includes("부모")) {
    return "늘 먼저 안부를 물어보던 포근한 마음";
  }
  if (normalized.includes("친구")) {
    return "무심한 듯 다정하게 웃어주던 순간";
  }
  if (normalized.includes("연인") || normalized.includes("자기")) {
    return "서로의 하루를 끝까지 들어주던 다정함";
  }
  return MOOD_BY_INDEX[index % MOOD_BY_INDEX.length];
}

function formatDisplayDate(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildMockLetterInbox(settings: LetterSettings, personaName: string): LetterInboxItem[] {
  const list: LetterInboxItem[] = [];
  const kinds = settings.enabledKinds.length > 0 ? settings.enabledKinds : ["morning"];

  for (let dayOffset = 0; dayOffset < 5; dayOffset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const dateLabel = formatDisplayDate(date);
    const iso = toIsoDate(date);

    if (kinds.includes("morning")) {
      list.push({
        id: `${iso}-morning`,
        kind: "morning",
        date: iso,
        title: `${dateLabel} 아침 편지`,
        preview: `${personaName}의 조용한 안부가 도착했어요. 오늘의 시작을 다정하게 열어보세요.`,
        unread: dayOffset === 0,
      });
    }

    if (kinds.includes("evening")) {
      list.push({
        id: `${iso}-evening`,
        kind: "evening",
        date: iso,
        title: `${dateLabel} 밤 편지`,
        preview: `${personaName}가 오늘 하루를 다정히 덮어주는 말을 남겼어요.`,
        unread: dayOffset === 0 && !kinds.includes("morning"),
      });
    }
  }

  return list;
}

export function buildMockLetterBody(kind: LetterKind, personaName: string) {
  if (kind === "morning") {
    return {
      heading: "오늘의 시작에 건네는 한 줄",
      body: `${personaName}, 오늘 아침은 조금 천천히 시작해도 괜찮아.\n\n네가 어제 견뎌낸 시간들 위에 오늘이 조용히 올라앉는 거니까, 너무 급하게 잘하려고 하지 않아도 돼.\n\n따뜻한 물 한 모금처럼, 네 마음도 천천히 깨워보자. 오늘도 네 편에서, 다정한 안부를 남겨둘게.`,
    };
  }

  return {
    heading: "오늘을 다정히 덮는 편지",
    body: `${personaName}, 오늘 하루도 수고 많았어.\n\n크게 잘한 것보다, 끝까지 버틴 마음이 더 귀하다는 걸 너는 이미 알고 있을 거야.\n\n지금은 잠깐 어깨 힘을 내려놓고, 네가 안전한 곳에 돌아왔다는 감각을 느껴봐.\n오늘의 마지막 페이지를 조용히 덮어둘게. 편안한 밤이 되길.`,
  };
}
