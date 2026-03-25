import { PersonaAnalysis, PersonaAnalyzeInput, PrimaryGoal } from "@/types/persona";
const ATTACHMENT_WORDS = new Set(["사진", "동영상", "파일", "이모티콘", "지도", "연락처", "음성메시지", "선물하기", "삭제된 메시지입니다"]);

type ParsedMessage = {
  sender: string | null;
  text: string;
  raw: string;
};

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function toIsoNow() {
  return new Date().toISOString();
}

function clamp(num: number, min: number, max: number) {
  return Math.min(max, Math.max(min, num));
}

function toId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `persona-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function goalToText(goal: PrimaryGoal, customGoalText: string) {
  if (goal === "comfort") return "위로와 안정";
  if (goal === "memory") return "추억 회상";
  if (goal === "unfinished_words") return "못다 한 말 정리";
  if (goal === "casual_talk") return "평소 같은 일상 대화";
  return customGoalText || "개인화된 대화";
}

function splitLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}*._~`'"“”‘’:,!?-]/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDateOnlyLine(line: string) {
  return (
    /^\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*[월화수목금토일]요일)?$/.test(line) ||
    /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?$/.test(line) ||
    /^[월화수목금토일]요일$/.test(line) ||
    /^(오전|오후)\s*\d{1,2}:\d{2}$/.test(line)
  );
}

function isSystemLine(line: string) {
  return (
    /님이 들어왔습니다|님이 나갔습니다|님을 초대했습니다|메시지를 가렸습니다|보낸 메시지를 삭제했습니다|채팅방 이름을 변경했습니다/.test(line) ||
    /^-{2,}$/.test(line)
  );
}

function cleanMessageText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .trim();
}

function normalizeAddressAlias(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 1 && (trimmed.endsWith("님") || trimmed.endsWith("씨"))) return trimmed.slice(0, -1);
  if (trimmed.length > 1 && (trimmed.endsWith("야") || trimmed.endsWith("아"))) {
    const base = trimmed.slice(0, -1);
    if (!base) return trimmed;
    if (/[야아]$/.test(base)) return trimmed;
    return base;
  }
  return trimmed;
}

function isAttachmentOnly(text: string) {
  const normalized = text.replace(/\s/g, "");
  return ATTACHMENT_WORDS.has(normalized);
}

function parseMessageLine(line: string): { sender: string | null; text: string } | null {
  const bracket = line.match(/^\[(.+?)\]\s*\[(오전|오후)\s*\d{1,2}:\d{2}\]\s*(.+)$/);
  if (bracket) {
    return { sender: bracket[1].trim(), text: bracket[3].trim() };
  }

  const inlineSimple = line.match(/^(오전|오후)\s*\d{1,2}:\d{2}\s+(\S{1,20})\s+(.+)$/);
  if (inlineSimple) {
    return { sender: inlineSimple[2].trim(), text: inlineSimple[3].trim() };
  }

  const inlineColon = line.match(/^(오전|오후)\s*\d{1,2}:\d{2},?\s*([^:]{1,30})\s*:\s*(.+)$/);
  if (inlineColon) {
    return { sender: inlineColon[2].trim(), text: inlineColon[3].trim() };
  }

  const reverseColon = line.match(/^([^,]{1,30}),\s*(오전|오후)\s*\d{1,2}:\d{2}\s*:\s*(.+)$/);
  if (reverseColon) {
    return { sender: reverseColon[1].trim(), text: reverseColon[3].trim() };
  }

  return null;
}

function parseConversationMessages(text: string) {
  const rawLines = splitLines(text);
  const messages: ParsedMessage[] = [];

  rawLines.forEach((line) => {
    if (isDateOnlyLine(line) || isSystemLine(line)) return;

    const parsed = parseMessageLine(line);
    if (parsed) {
      const cleaned = cleanMessageText(parsed.text);
      if (!cleaned || isAttachmentOnly(cleaned)) return;
      messages.push({
        sender: parsed.sender || null,
        text: cleaned,
        raw: line,
      });
      return;
    }

    const cleaned = cleanMessageText(line);
    if (!cleaned || isAttachmentOnly(cleaned)) return;

    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      last.text = `${last.text} ${cleaned}`.trim();
      return;
    }

    messages.push({ sender: null, text: cleaned, raw: line });
  });

  return messages;
}

function inferPersonaSender(messages: ParsedMessage[], input: PersonaAnalyzeInput) {
  const senderNames = unique(messages.map((m) => m.sender || "").filter(Boolean));
  if (senderNames.length === 0) return { personaSender: null as string | null, userSender: null as string | null };

  const personaName = normalizeComparable(input.step3.personaName);
  const relation = normalizeComparable(input.step3.relation);
  const userName = normalizeComparable(input.step1.userName);

  let bestPersona: { name: string; score: number } | null = null;
  let bestUser: { name: string; score: number } | null = null;

  for (const name of senderNames) {
    const key = normalizeComparable(name);
    const senderCorpus = messages
      .filter((message) => message.sender === name)
      .map((message) => cleanMessageText(message.text))
      .join("\n");
    const normalizedCorpus = normalizeComparable(senderCorpus);

    let personaScore = 0;
    if (personaName && key === personaName) personaScore += 5;
    if (relation && key === relation) personaScore += 4;
    if (personaName && (key.includes(personaName) || personaName.includes(key))) personaScore += 2;
    if (relation && (key.includes(relation) || relation.includes(key))) personaScore += 2;
    if (userName && normalizedCorpus.includes(userName)) personaScore += 2;

    let userScore = 0;
    if (userName && key === userName) userScore += 5;
    if (userName && (key.includes(userName) || userName.includes(key))) userScore += 2;
    if (relation && normalizedCorpus.includes(relation)) userScore += 2;
    if (personaName && normalizedCorpus.includes(personaName)) userScore += 2;

    if (!bestPersona || personaScore > bestPersona.score) bestPersona = { name, score: personaScore };
    if (!bestUser || userScore > bestUser.score) bestUser = { name, score: userScore };
  }

  const userSender = bestUser && bestUser.score > 0 ? bestUser.name : null;
  let personaSender = bestPersona && bestPersona.score > 0 ? bestPersona.name : null;

  if (!personaSender && userSender && senderNames.length === 2) {
    personaSender = senderNames.find((name) => name !== userSender) || null;
  }

  return { personaSender, userSender };
}

function prepareConversation(input: PersonaAnalyzeInput) {
  const rawText = input.step4.conversationText.trim();
  const messages = parseConversationMessages(rawText);
  const { personaSender, userSender } = inferPersonaSender(messages, input);

  let personaMessages = messages;
  let userMessages: ParsedMessage[] = [];

  if (personaSender) {
    personaMessages = messages.filter((message) => message.sender === personaSender);
    if (userSender) {
      userMessages = messages.filter((message) => message.sender === userSender);
    } else {
      userMessages = messages.filter((message) => message.sender && message.sender !== personaSender);
    }
  } else if (userSender) {
    const other = messages.filter((message) => message.sender && message.sender !== userSender);
    if (other.length > 0) personaMessages = other;
    userMessages = messages.filter((message) => message.sender === userSender);
  }

  const personaLines = personaMessages.map((message) => cleanMessageText(message.text)).filter((line) => line.length >= 2);
  const userLines = userMessages.map((message) => cleanMessageText(message.text)).filter((line) => line.length >= 2);

  return {
    rawText,
    messages,
    personaLines,
    userLines,
    personaSender,
    userSender,
  };
}

function extractEmojiSamples(text: string) {
  const matches = text.match(/[\p{Extended_Pictographic}]/gu) || [];
  return unique(matches).slice(0, 6);
}

function normalizeLaughterToken(token: string) {
  if (/ㅋ/.test(token) || /크크/.test(token)) return "ㅋㅋ";
  if (/ㅎ/.test(token) || /하하|헤헤/.test(token)) return "ㅎㅎ";
  return "ㅎㅎ";
}

function extractLaughter(text: string) {
  const matches = text.match(/ㅋ{2,}|ㅎ{2,}|하하+|헤헤+|크크+/g) || [];
  const normalized = matches.map((item) => normalizeLaughterToken(item));
  return unique(normalized).slice(0, 3);
}

function extractSadness(text: string) {
  const matches = text.match(/ㅠ+|ㅜ+|속상|슬프|울컥|힘들/g) || [];
  const normalized = matches.map((item) => (/^[ㅠㅜ]+$/.test(item) ? "ㅠㅠ" : item));
  return unique(normalized).slice(0, 4);
}

function extractTypos(text: string) {
  const candidates = ["괜찬", "맞어", "갠차나", "머해", "잇어", "그랫어"];
  return candidates.filter((word) => text.includes(word)).slice(0, 4);
}

function normalizePhraseKey(line: string) {
  return line
    .replace(/\s+/g, " ")
    .replace(/[!?~.,'"`“”]/g, "")
    .trim()
    .toLowerCase();
}

function pickFrequentPhrases(lines: string[], manualPhrases: string[]) {
  const freq = new Map<string, { phrase: string; count: number }>();

  lines
    .map((line) => cleanMessageText(line))
    .filter((line) => line.length >= 2 && line.length <= 24)
    .filter((line) => !isAttachmentOnly(line))
    .forEach((line) => {
      const key = normalizePhraseKey(line);
      if (!key) return;
      const prev = freq.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        freq.set(key, { phrase: line, count: 1 });
      }
    });

  const fromConversation = [...freq.values()]
    .sort((a, b) => b.count - a.count || a.phrase.length - b.phrase.length)
    .map((item) => item.phrase)
    .slice(0, 10);

  return unique([...manualPhrases, ...fromConversation]).slice(0, 8);
}

function pickOpeners(lines: string[]) {
  return unique(
    lines
      .map((line) => line.split(/\s+/)[0])
      .filter((word) => word && word.length <= 8),
  ).slice(0, 5);
}

function pickClosers(lines: string[]) {
  return unique(
    lines
      .map((line) => line.split(/\s+/).pop() || "")
      .filter((word) => word.length > 0 && word.length <= 8),
  ).slice(0, 5);
}

function detectPoliteness(text: string) {
  const politeHits = (text.match(/요\b|습니다|세요/g) || []).length;
  const casualHits = (text.match(/야\b|해\b|했어|했네/g) || []).length;
  if (politeHits > casualHits + 2) return "존댓말 중심";
  if (casualHits > politeHits + 1) return "반말 중심";
  return "상황형 혼합";
}

function detectSentenceLength(lines: string[]) {
  if (lines.length === 0) return "보통";
  const avg = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
  if (avg < 12) return "짧고 간결함";
  if (avg < 26) return "중간 길이";
  return "상대적으로 김";
}

function detectTempo(lines: string[]) {
  if (lines.length >= 30) return "빠름";
  if (lines.length >= 12) return "중간";
  return "차분함";
}

function detectIntensity(text: string) {
  const emotionHits = (text.match(/[!?~]|ㅠ+|ㅜ+|ㅋ{2,}|ㅎ{2,}/g) || []).length;
  if (emotionHits >= 12) return "높음";
  if (emotionHits >= 5) return "중간";
  return "낮음";
}

function inferUserCallsPersonaAs(userLines: string[], relation: string, personaName: string) {
  const inferred: string[] = [];
  const cleanRelation = normalizeAddressAlias(relation);
  const cleanName = normalizeAddressAlias(personaName);
  const joined = userLines.join("\n");

  if (cleanRelation) {
    const relationRe = new RegExp(`(?:^|\\s|[,"'“”‘’])${escapeRegExp(cleanRelation)}(?:야|아|님)?(?=\\s|[,.!?]|$)`, "g");
    if (relationRe.test(joined)) inferred.push(cleanRelation);
  }

  if (cleanName) {
    const nameRe = new RegExp(`(?:^|\\s|[,"'“”‘’])${escapeRegExp(cleanName)}(?:야|아|님)?(?=\\s|[,.!?]|$)`, "g");
    if (nameRe.test(joined)) inferred.push(cleanName);
  }

  const extraMatches = joined.match(/(?:^|[\s,])([가-힣]{2,8}(?:님|씨|야|아))(?=[\s,.!?]|$)/g) || [];
  extraMatches
    .map((item) => item.trim().replace(/^[,\s]+/, ""))
    .map((item) => normalizeAddressAlias(item))
    .forEach((item) => inferred.push(item));

  return unique([cleanRelation, cleanName, ...inferred].filter(Boolean)).slice(0, 4);
}

function analyzeWorkStyleFromPersonaLines(personaLines: string[], occupation: string) {
  const occupationTrimmed = occupation.trim();
  const workLines = personaLines.filter((line) => {
    const normalized = line.replace(/\s/g, "");
    return (
      /(일|회사|업무|출근|퇴근|야근|근무|현장|손님|매출|회의|프로젝트|수업|환자|진료|학생|가르치|개발|코드)/.test(normalized) ||
      (occupationTrimmed && normalized.includes(occupationTrimmed.replace(/\s/g, "")))
    );
  });

  const corpus = workLines.join("\n");
  const stressScore = (corpus.match(/힘들|피곤|지쳤|바빠|야근|빡세|스트레스|퇴근하고싶/g) || []).length;
  const prideScore = (corpus.match(/보람|뿌듯|잘했|성과|재밌|재미|칭찬|잘풀렸|성장/g) || []).length;
  const complaintScore = (corpus.match(/짜증|답답|빡치|싫다|힘들다/g) || []).length;

  let attitudeSummary = "직업에 대해 담백하게 근황을 공유하는 편입니다.";
  let tendencyTags = ["담백한 근황 공유형"];
  let selfTalkStyle = "오늘 일은 무난했어. 너는 어땠어?";

  if (workLines.length === 0) {
    attitudeSummary = occupationTrimmed
      ? `${occupationTrimmed} 관련 발화 데이터가 많지 않아 직업 태도는 기본값으로 추정했습니다.`
      : "직업 관련 발화 데이터가 많지 않아 직업 태도를 추정하기 어렵습니다.";
    tendencyTags = ["직업 데이터 부족"];
    selfTalkStyle = "오늘 하루는 그냥 조용히 지나갔어.";
    return { attitudeSummary, tendencyTags, selfTalkStyle };
  }

  if (stressScore > prideScore + 1 || complaintScore >= 2) {
    attitudeSummary = "일이 힘들 때 피로감이나 고단함을 비교적 솔직하게 표현하는 편입니다.";
    tendencyTags = ["업무피로 토로형", "현실공유형"];
    selfTalkStyle = "오늘 일하다가 좀 지쳤어. 그래도 네 얘기 들으니까 마음이 풀리네.";
  } else if (prideScore > stressScore + 1) {
    attitudeSummary = "일에서 얻는 성취감이나 보람을 긍정적으로 표현하는 편입니다.";
    tendencyTags = ["성취공유형", "자부심 표현형"];
    selfTalkStyle = "오늘은 일에서 작은 성과가 있어서 조금 뿌듯했어.";
  } else {
    attitudeSummary = "일의 힘든 점과 보람을 균형 있게 이야기하는 편입니다.";
    tendencyTags = ["균형형 직업서술", "일상공유형"];
    selfTalkStyle = "오늘 일은 조금 바빴지만 나름 괜찮았어.";
  }

  return { attitudeSummary, tendencyTags, selfTalkStyle };
}

function pickTopics(text: string, extraContext: string) {
  const corpus = `${text}\n${extraContext}`;
  const map: Array<{ keyword: RegExp; label: string }> = [
    { keyword: /밥|먹었|식사/, label: "식사/건강" },
    { keyword: /일|회사|출근|퇴근/, label: "일상/업무" },
    { keyword: /잠|자|새벽|밤/, label: "휴식/수면" },
    { keyword: /가족|엄마|아빠|형|언니|동생/, label: "가족 이야기" },
    { keyword: /추억|기억|예전|그때/, label: "추억 회상" },
    { keyword: /걱정|힘들|위로|괜찮/, label: "감정/위로" },
  ];

  const found = map.filter((item) => item.keyword.test(corpus)).map((item) => item.label);
  return unique(found).slice(0, 6);
}

function buildMemoryAnchors(lines: string[], relation: string, userNickname: string) {
  const anchors = lines
    .filter((line) => line.length >= 8)
    .slice(0, 3)
    .map((line, idx) => ({
      title: `${relation} 기억 ${idx + 1}`,
      summary: line,
    }));

  if (anchors.length < 3 && userNickname.trim()) {
    anchors.push({ title: "호칭 기억", summary: `${relation}가 사용자를 "${userNickname.trim()}"라고 부르던 패턴이 반영되었습니다.` });
  }

  if (anchors.length === 0) {
    anchors.push({ title: "관계 기반 기본 기억", summary: `${relation}와의 대화 분위기를 중심으로 구성된 기본 기억입니다.` });
  }

  return anchors.slice(0, 3);
}

function includesNicknameInConversation(lines: string[], nickname: string) {
  const normalizedNickname = normalizeComparable(nickname);
  if (!normalizedNickname) return false;
  return lines.some((line) => normalizeComparable(line).includes(normalizedNickname));
}

function inferCallsUserAs(lines: string[], manualNickname: string, userName: string, step3Nickname: string) {
  const aliases: string[] = [];
  const strongFromStep3 = normalizeAddressAlias(step3Nickname);
  const hasStrongEvidence = includesNicknameInConversation(lines, strongFromStep3);

  if (hasStrongEvidence && strongFromStep3) {
    aliases.push(strongFromStep3);
  }
  aliases.push(...unique([normalizeAddressAlias(manualNickname)].filter(Boolean)));
  if (!hasStrongEvidence && strongFromStep3) {
    aliases.push(strongFromStep3);
  }

  const joined = lines.join("\n");

  const matches = joined.match(/(?:^|[\s,])([가-힣]{2,6}(?:아|야|씨))(?=[\s,.!?]|$)/g) || [];
  matches
    .map((item) => item.trim().replace(/^[,\s]+/, ""))
    .map((item) => normalizeAddressAlias(item))
    .forEach((item) => aliases.push(item));

  const cleanedUserName = normalizeAddressAlias(userName);
  if (cleanedUserName) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(cleanedUserName)}(?:[아야씨])?(?=\\s|[,.!?]|$)`, "g");
    if (re.test(joined)) {
      aliases.push(cleanedUserName);
    }
  }

  return {
    aliases: unique(aliases).slice(0, 3),
    strongAlias: hasStrongEvidence ? strongFromStep3 : "",
  };
}

export function analyzePersonaMock(input: PersonaAnalyzeInput): PersonaAnalysis {
  const now = toIsoNow();
  const personaId = toId();

  const prepared = prepareConversation(input);
  const conversationText = prepared.rawText;
  const focusedPersonaLines = prepared.personaLines;
  const focusedUserLines = prepared.userLines;

  const hasConversationText = conversationText.length > 0;
  const hasManualSettings =
    input.step4.manualMode &&
    (input.step4.manualSettings.frequentPhrases.length > 0 ||
      Boolean(input.step4.manualSettings.nickname) ||
      Boolean(input.step4.manualSettings.tone));

  const sourceType = hasConversationText ? "chat_upload" : "manual_only";

  const fallbackLines = splitLines(conversationText)
    .filter((line) => !isDateOnlyLine(line) && !isSystemLine(line))
    .map((line) => cleanMessageText(line))
    .filter((line) => line.length >= 2 && !isAttachmentOnly(line));
  const lines = focusedPersonaLines.length > 0 ? focusedPersonaLines : fallbackLines;
  const userLines = focusedUserLines.length > 0 ? focusedUserLines : [];
  const corpus = lines.join("\n");

  const frequentPhrases = pickFrequentPhrases(lines, input.step4.manualSettings.frequentPhrases);
  const frequentOpeners = pickOpeners(lines);
  const frequentClosers = pickClosers(lines);
  const laughterPatterns = extractLaughter(corpus);
  const sadnessPatterns = extractSadness(corpus);
  const typoExamples = extractTypos(corpus);
  const emojiExamples = extractEmojiSamples(corpus);

  const addressingInference = inferCallsUserAs(lines, input.step4.manualSettings.nickname, input.step1.userName, input.step3.userNickname);
  const callsUserAs = addressingInference.aliases;
  const userCallsPersonaAs = inferUserCallsPersonaAs(userLines, input.step3.relation, input.step3.personaName);

  const baseTone = unique(
    [input.step4.manualSettings.tone, input.step4.manualSettings.mood, input.step2.primaryGoal === "comfort" ? "위로 중심" : ""].filter(Boolean),
  );

  const topics = pickTopics(corpus, input.step3.userNickname);
  const memoryAnchors = buildMemoryAnchors(lines, input.step3.relation, input.step3.userNickname);
  const workStyle = analyzeWorkStyleFromPersonaLines(lines, input.step3.personaOccupation);

  const confidenceBase = hasConversationText ? (lines.length >= 25 ? 0.84 : lines.length >= 8 ? 0.72 : 0.58) : 0.46;
  const confidence = clamp(
    confidenceBase +
    (hasManualSettings ? 0.06 : 0) +
    (callsUserAs.length > 0 ? 0.04 : -0.05) +
    (addressingInference.strongAlias ? 0.05 : 0),
    0.3,
    0.94,
  );

  const uncertainFields: { field: string; reason: string }[] = [];
  if (!hasConversationText) {
    uncertainFields.push({ field: "textHabits", reason: "대화 원문이 없어 수동 설정 기반으로 추정했습니다." });
    uncertainFields.push({ field: "memoryAnchors", reason: "대화 맥락이 부족해 기본 관계 정보 중심으로 구성했습니다." });
  }
  if (callsUserAs.length === 0) {
    uncertainFields.push({ field: "addressing.callsUserAs", reason: "사용자를 부르는 호칭 정보가 부족합니다." });
  }
  if (!input.step3.userNickname.trim()) {
    uncertainFields.push({ field: "addressing.callsUserAs", reason: "3단계에서 애칭 정보가 비어 있어 호칭 추정 정확도가 낮습니다." });
  }
  if (hasConversationText && lines.length === 0) {
    uncertainFields.push({ field: "textHabits", reason: "대화 형식을 인식하지 못해 유효 문장을 추출하지 못했습니다." });
  } else if (hasConversationText && lines.length < 4) {
    uncertainFields.push({ field: "speechStyle", reason: "유효 대화 문장 수가 적어 말투 분석 정확도가 낮습니다." });
  }
  if (hasConversationText && prepared.personaSender === null && prepared.messages.some((m) => m.sender)) {
    uncertainFields.push({ field: "personaSender", reason: "대화 참여자 식별이 명확하지 않아 일부 분석이 혼합될 수 있습니다." });
  }
  if (hasConversationText && prepared.userSender === null && prepared.messages.some((m) => m.sender)) {
    uncertainFields.push({ field: "userSender", reason: "사용자 발화 화자 식별이 불명확해 호칭 분석 정확도가 낮을 수 있습니다." });
  }
  if (input.step3.userNickname.trim() && !addressingInference.strongAlias && hasConversationText) {
    uncertainFields.push({ field: "addressing.callsUserAs", reason: "입력한 애칭이 대화 원문에서 충분히 확인되지 않아 보조 호칭으로만 반영했습니다." });
  }
  if (!input.step3.personaOccupation.trim()) {
    uncertainFields.push({ field: "personaWorkStyle", reason: "3단계 직업 정보가 없어 직업 관련 태도는 대화 원문 기반으로만 추정했습니다." });
  }

  const limitations = [
    hasConversationText ? "제공된 대화 범위 내에서만 분석했습니다." : "대화 원문 없이 수동 설정값 위주로 분석했습니다.",
    hasConversationText ? "카카오톡 내보내기 형식의 시간/이름 메타 줄은 자동 제외했습니다." : "대화 원문이 없어 메타 줄 정제 과정을 적용하지 않았습니다.",
    "실제 인물 동일성 재현이 아닌 대화 분위기 재구성 목적입니다.",
  ];

  const goalText = goalToText(input.step2.primaryGoal, input.step2.customGoalText);
  const oneLineSummary = `${input.step3.relation} ${input.step3.personaName}의 말투를 바탕으로 ${goalText}에 맞춘 ${baseTone[0] || "차분한"} 대화 페르소나입니다.`;

  return {
    personaId,
    createdAt: now,
    updatedAt: now,

    userInput: {
      userName: input.step1.userName,
      userGender: input.step1.userGender,
    },

    personaInput: {
      displayName: input.step3.personaName,
      relation: input.step3.relation,
      gender: input.step3.personaGender,
      avatarUrl: input.step3.avatarUrl,
      userNickname: input.step3.userNickname,
      occupation: input.step3.personaOccupation,
    },

    personaWorkStyle: {
      attitudeSummary: workStyle.attitudeSummary,
      tendencyTags: workStyle.tendencyTags,
      selfTalkStyle: workStyle.selfTalkStyle,
    },

    conversationIntent: {
      primaryGoal: input.step2.primaryGoal,
      customGoalText: input.step2.customGoalText,
    },

    sourceData: {
      sourceType,
      hasConversationText,
      hasManualSettings,
      uploadedFileName: input.step4.uploadedFileName,
    },

    analysisSummary: {
      oneLineSummary,
      confidence: Number(confidence.toFixed(2)),
      limitations,
    },

    addressing: {
      callsUserAs,
      userCallsPersonaAs,
    },

    speechStyle: {
      baseTone: baseTone.length > 0 ? baseTone : ["차분함", "다정함"],
      politeness: detectPoliteness(corpus),
      sentenceLength: detectSentenceLength(lines),
      responseTempo: detectTempo(lines),
      emotionalIntensity: detectIntensity(corpus),
      humorStyle: laughterPatterns.length > 0 ? "가벼운 웃음 표현 사용" : "담백한 톤",
    },

    textHabits: {
      frequentPhrases,
      frequentOpeners: frequentOpeners.length > 0 ? frequentOpeners : ["오늘", "괜찮아"],
      frequentClosers: frequentClosers.length > 0 ? frequentClosers : ["해", "줘"],
      fillerWords: unique((corpus.match(/그냥|약간|뭔가|음|사실/g) || []).slice(0, 5)),
    },

    expressionStyle: {
      emojiEnabled: emojiExamples.length > 0 || input.step4.manualSettings.emojiStyle.includes("많이"),
      emojiExamples: emojiExamples.length > 0 ? emojiExamples : input.step4.manualSettings.emojiStyle.includes("전혀") ? [] : ["🙂", "💬"],
      laughterPatterns: laughterPatterns.length > 0 ? laughterPatterns : ["ㅎㅎ"],
      sadnessPatterns: sadnessPatterns.length > 0 ? sadnessPatterns : ["ㅠㅠ"],
      typoExamples,
    },

    conversationBehavior: {
      acknowledgementStyle: input.step2.primaryGoal === "comfort" ? "감정 수용 후 짧은 공감" : "핵심 요약 후 반응",
      feedbackStyle: input.step2.primaryGoal === "unfinished_words" ? "경청 중심" : "짧은 피드백 중심",
      empathyFirst: input.step2.primaryGoal !== "casual_talk",
      asksBackFrequency: input.step2.primaryGoal === "casual_talk" ? "보통" : "낮음",
      selfDisclosure: "낮음",
      conflictStyle: "완화형",
      preferredReplyLength: input.step4.manualSettings.tone.includes("짧") ? "짧게" : "1~3문장",
    },

    topics: {
      frequent: topics.length > 0 ? topics : ["일상 안부", "감정 정리"],
      comfortTopics: ["오늘 하루", "건강", "휴식", "마음 상태"],
      avoidTopics: ["강한 단정", "과도한 압박"],
    },

    memoryAnchors,

    sampleReplies: [],

    uncertainFields,
  };
}
