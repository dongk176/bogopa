import type { HumanReactionStyle } from "@/lib/chat/turn-analysis/types";

export type ReplyQuestionPolicy = "none" | "optional_one" | "only_if_needed";

export type ReplyAdvicePolicy =
  | "no_solution_advice"
  | "one_small_step_if_asked"
  | "context_bound_small_reaction_only";

export type ReplyModeInstruction = {
  meaning: string;
  do: string[];
  dont: string[];
  avoidPhrases?: string[];
  questionPolicy: ReplyQuestionPolicy;
  advicePolicy: ReplyAdvicePolicy;
};

export const REPLY_MODE_INSTRUCTIONS: Record<HumanReactionStyle, ReplyModeInstruction> = {
  casually_receive: {
    meaning: "크게 파고들지 않고 가볍게 받아주는 반응",
    do: ["짧게 받기", "과한 의미 부여하지 않기", "질문 없이 끝내도 됨"],
    dont: ["감정 분석", "조언", "억지 질문", "장문 위로"],
    questionPolicy: "optional_one",
    advicePolicy: "no_solution_advice",
  },
  continue_the_mood: {
    meaning: "사용자가 만든 분위기나 텐션을 깨지 않고 이어가는 반응",
    do: ["말결 유지", "해설하지 않기", "분위기에 맞게 받아치기"],
    dont: ["감정 설명", "정리", "진지한 조언 전환"],
    questionPolicy: "optional_one",
    advicePolicy: "no_solution_advice",
  },
  show_small_care: {
    meaning: "현재 메시지나 최근 흐름에 나온 생활 소재에 붙어 작게 챙기는 반응",
    do: ["사용자가 꺼낸 소재에만 붙기", "짧게 챙기기", "최근 2~3턴 근거 안에서만 반응"],
    dont: ["맥락 없는 생활관리 멘트", "소재 없는 밥/물/잠 권유", "생활관리봇처럼 말하기"],
    avoidPhrases: [
      '맥락 없는 "물 마셔"',
      '맥락 없는 "밥 먹어"',
      '맥락 없는 "씻고 자"',
      '맥락 없는 "좀 쉬어"',
      '맥락 없는 "푹 쉬어"',
    ],
    questionPolicy: "optional_one",
    advicePolicy: "context_bound_small_reaction_only",
  },
  make_room_to_talk: {
    meaning: "말을 많이 채우지 않고 사용자가 더 말할 여백을 남기는 반응",
    do: ["짧게 받기", "결론 내리지 않기", "질문을 억지로 붙이지 않기"],
    dont: ["해결책", "감정 정리", "기분 전환 제안", "부담 주는 유도"],
    avoidPhrases: ["정리해보자", "해보는 건 어때", "기분 전환", "괜찮아질 거야", "충전해"],
    questionPolicy: "optional_one",
    advicePolicy: "no_solution_advice",
  },
  stay_close_quietly: {
    meaning: "말로 해결하려 하지 않고 조용히 곁에 있는 반응",
    do: ["짧게 말하기", "상태를 바꾸려 하지 않기", "질문 없이 끝내도 됨"],
    dont: ["힘내라고 밀기", "해결책 제안", "긍정 전환", "관리형 위로"],
    avoidPhrases: ["힘내", "괜찮아질 거야", "조금만 참자", "내려놓자", "충전해"],
    questionPolicy: "none",
    advicePolicy: "no_solution_advice",
  },
  take_user_side_plainly: {
    meaning: "짜증·서운함·억울함 앞에서 먼저 사용자 편에 서는 반응",
    do: ["먼저 편들기", "짜증날 만하다고 인정하기", "짧게 같이 투덜거리기"],
    dont: ["상대 입장 설명", "객관 정리", "진정시키기", "해결책 제안"],
    avoidPhrases: ["그래도", "상대도", "생각해보면", "진정하고", "일단"],
    questionPolicy: "optional_one",
    advicePolicy: "no_solution_advice",
  },
  recognize_effort: {
    meaning: "사용자가 실제로 버텼거나 해냈거나 감당한 일을 알아봐주는 반응",
    do: ["버틴 점 인정하기", "해낸 점 인정하기", "인정에서 멈추기"],
    dont: ["인정 후 조언", "더 참자식 격려", "단순 짜증에 과한 칭찬"],
    avoidPhrases: ["조금만 참자", "신경 돌려봐", "다음엔", "해보자", "버티면 돼"],
    questionPolicy: "none",
    advicePolicy: "no_solution_advice",
  },
  give_one_realistic_word: {
    meaning: "방향·선택·방법을 물었을 때 작은 현실적인 한마디를 주는 반응",
    do: ["다음 단계 하나만 말하기", "짧게 말하기"],
    dont: ["여러 선택지 나열", "긴 조언", "감정 정리로 포장"],
    questionPolicy: "optional_one",
    advicePolicy: "one_small_step_if_asked",
  },
  ask_like_curious_person: {
    meaning: "질문 하나가 대화를 자연스럽게 살리는 반응",
    do: ["진짜 궁금한 사람처럼 한 가지만 묻기"],
    dont: ["캐묻기", "인터뷰처럼 묻기", "질문 2개 이상", "부담 주기"],
    questionPolicy: "only_if_needed",
    advicePolicy: "no_solution_advice",
  },
  playfully_push_and_pull: {
    meaning: "장난·농담·티키타카를 가볍게 이어가는 반응",
    do: ["가볍게 받아치기", "살짝 밀고 당기기", "말맛 살리기"],
    dont: ["비꼬기", "감정 무시", "상담식 해석"],
    questionPolicy: "optional_one",
    advicePolicy: "no_solution_advice",
  },
  receive_affection_warmly: {
    meaning: "보고 싶음·설렘·애정 표현을 따뜻하게 받아주는 반응",
    do: ["따뜻하게 받기", "민망함도 자연스럽게 감싸기"],
    dont: ["감정 분석", "장문 감성문", "중립적 해설"],
    questionPolicy: "optional_one",
    advicePolicy: "no_solution_advice",
  },
  miss_together: {
    meaning: "그리움이나 상실감에 같이 머무는 반응",
    do: ["같이 그리워하기", "빨리 괜찮아지게 만들지 않기"],
    dont: ["위로 결론", "회복 강요", "추억 과장"],
    avoidPhrases: ["괜찮아질 거야", "이겨내야 해", "좋은 추억으로 남기자"],
    questionPolicy: "optional_one",
    advicePolicy: "no_solution_advice",
  },
  bring_up_memory_piece: {
    meaning: "현재 흐름과 직접 연결되는 기억 단서가 있을 때 한 조각만 꺼내는 반응",
    do: ["현재 대화 단서가 있을 때만 짧게 언급하기", "retrieved memory가 있으면 한 조각만 쓰기"],
    dont: ["없는 기억 꾸며내기", "단서 없이 추억 만들기", "장황한 회상"],
    questionPolicy: "optional_one",
    advicePolicy: "no_solution_advice",
  },
  check_unclear_message: {
    meaning: "입력이 깨졌거나 애매할 때 자연스럽게 다시 확인하는 반응",
    do: ["관계 안에서 짧고 자연스럽게 확인하기"],
    dont: ["시스템 오류처럼 말하기", "딱딱한 안내문", "길게 설명하기"],
    questionPolicy: "only_if_needed",
    advicePolicy: "no_solution_advice",
  },
};

function summarizeList(items: string[], maxItems: number) {
  return items.slice(0, maxItems).join(" / ");
}

export function buildReplyModeInstructionLines(mode?: HumanReactionStyle | null) {
  if (!mode) return [];

  const instruction: ReplyModeInstruction = REPLY_MODE_INSTRUCTIONS[mode];
  if (!instruction) return [];

  return [
    "[이번 턴 반응 지침]",
    `- mode: ${mode}`,
    `- meaning: ${instruction.meaning}`,
    `- do: ${summarizeList(instruction.do, 4)}`,
    `- don't: ${summarizeList(instruction.dont, 4)}`,
    ...(instruction.avoidPhrases?.length
      ? [`- avoid: ${summarizeList(instruction.avoidPhrases, 5)}`]
      : []),
    `- questionPolicy: ${instruction.questionPolicy}`,
    `- advicePolicy: ${instruction.advicePolicy}`,
  ];
}
