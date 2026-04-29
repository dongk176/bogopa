import {
  OPENAI_LABEL_MODEL,
  OPENAI_TURN_ANALYSIS_MODEL,
} from "@/lib/ai/createOpenAIClient";
import type { PersonaRuntime } from "@/types/persona";
import {
  EMOTION_MAX_LENGTH,
  HUMAN_REACTION_STYLE_VALUES,
  INTENT_MAX_LENGTH,
  REASON_MAX_LENGTH,
  TEXT_QUALITY_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  UNFINISHED_POINT_MAX_LENGTH,
} from "./constants";
import { buildFallbackTurnAnalysis, normalizeTurnAnalysis } from "./normalize";
import type {
  InferTurnAnalysisInput,
  InferTurnAnalysisResult,
  PreviousTurnAnalysis,
} from "./types";

function buildPersonaPayload(runtimeData: PersonaRuntime, alias?: string | null) {
  return {
    relation: runtimeData.relation || null,
    name: runtimeData.displayName || null,
    userAlias: alias || null,
  };
}

function isGpt5FamilyModel(model: string) {
  return /^gpt-5/i.test(model.trim());
}

function buildNullableLabelFieldSchema(description: string) {
  return {
    anyOf: [{ type: "string" }, { type: "null" }],
    description,
  } as const;
}

function buildNullableUnfinishedPointFieldSchema(description: string) {
  return {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["none"],
          },
          value: {
            type: "null",
          },
        },
        required: ["status", "value"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["present"],
          },
          value: {
            type: "string",
          },
        },
        required: ["status", "value"],
      },
    ],
    description,
  } as const;
}

const TURN_ANALYSIS_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "turn_analysis_payload",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        topic: buildNullableLabelFieldSchema(
          "이번 사용자 메시지가 무엇에 대한 어떤 말인지 함께 담는 현재 장면 라벨. 단순 주제명이 아니라 장면처럼 읽히는 짧은 한국어 구문.",
        ),
        topicShift: {
          type: "string",
          enum: ["same_topic", "soft_shift", "hard_shift"],
        },
        primaryIntent: {
          type: "string",
        },
        emotion: {
          type: "string",
        },
        intensity: {
          type: "integer",
          minimum: 0,
          maximum: 5,
        },
        desiredResponseMode: {
          type: "string",
          enum: [...HUMAN_REACTION_STYLE_VALUES],
        },
        unfinishedPoint: buildNullableUnfinishedPointFieldSchema(
          "아직 안 끝난 포인트. 없으면 status는 none이고 value는 JSON null. 있으면 status는 present이고 value는 짧은 한국어 구문. placeholder 문자열은 금지.",
        ),
        textQuality: {
          type: "string",
        },
        reason: {
          type: "string",
        },
      },
      required: [
        "topic",
        "topicShift",
        "primaryIntent",
        "emotion",
        "intensity",
        "desiredResponseMode",
        "unfinishedPoint",
        "textQuality",
        "reason",
      ],
    },
  },
} as const;

function buildSystemPrompt() {
  return [
    '너는 보고파 AI 컴패니언 서비스의 "사용자 응답 분석기"다.',
    "",
    "사용자의 최신 메시지와 최근 대화 흐름을 바탕으로, 사용자의 현재 상태와 현재 대화 상태를 저장용 JSON으로 분석한다.",
    "답변을 생성하지 않는다.",
    "위로, 조언, 말투, 답변 문장을 쓰지 않는다.",
    "반드시 JSON 객체 하나만 반환한다.",
    "markdown, 설명문, 코드블록, 불필요한 텍스트를 출력하지 않는다.",
    "",
    "판단 우선순위:",
    "1. 최신 사용자 메시지를 가장 우선해서 해석한다.",
    "2. recentMessages는 현재 메시지가 어떤 흐름 위에 놓여 있는지 파악하는 데 사용한다.",
    "3. recentMessages를 볼 때, 최근 흐름에서 아직 끝나지 않은 감정, 질문, 긴장, 어색함이 남아 있는지도 함께 판단한다.",
    "4. 최신 메시지가 분명하면 최신 메시지를 우선하되, 최근 흐름의 연장인지 화제 전환인지도 같이 본다.",
    "5. previousAnalysis는 현재 메시지가 짧거나 모호할 때만 약하게 참고한다.",
    "",
    "출력 원칙:",
    "- topic, primaryIntent, emotion, unfinishedPoint, textQuality는 짧은 한국어 표현으로 쓴다.",
    "- 지나치게 창의적이거나 문학적이거나 시적인 표현은 금지한다.",
    "- 비슷한 상황에서는 비슷한 표현을 재사용하려고 한다.",
    "- 사용자의 문장을 길게 복사하지 않는다.",
    "- 각 필드는 짧고 재사용 가능한 저장용 라벨처럼 쓴다.",
    "- reason만 한 문장으로 쓴다.",
    "",
    "필드 규칙:",
    `- topic: 이번 사용자 메시지가 어떤 장면인지 한 줄로 붙잡는 짧은 한국어 라벨이다. 실제 대상, 상황, 행동이 드러나야 한다. 분석용 분류명이나 추상 요약이 아니라, 사용자가 지금 꺼낸 장면이 보이게 쓴다. 보통 "~에서 ~한 일", "~ 때문에 ~한 상태", "~을 두고 ~하는 마음", "~ 뒤 ~한 기분", "~이 떠오른 순간" 같은 장면형 명사구가 자연스럽다. 답변 방식은 쓰지 않는다. 감정명만 단독으로 쓰지 않는다. "일상 대화", "감정 표현", "현재 상태", "상황", "생각", "대화"처럼 넓은 메타 라벨은 쓰지 않는다. 가능한 한 ${TOPIC_MAX_LENGTH}자 안쪽으로 쓴다.`,
    "- topicShift: 아래 셋 중 하나만 사용한다. same_topic, soft_shift, hard_shift",
    `- primaryIntent: 사용자가 지금 얻고 싶어 하는 목적을 짧은 한국어 구문으로 쓴다. 감정이 아니라 원하는 것 관점으로 쓴다. AI가 어떻게 반응해야 하는지나 말투는 쓰지 않는다. desiredResponseMode와 같은 의미를 반복하지 않는다. 가능한 한 ${INTENT_MAX_LENGTH}자 안쪽으로 쓴다.`,
    `- emotion: 현재 감정을 짧은 한국어 감정어로 쓴다. 가장 중심이 되는 감정 하나를 우선한다. 가능한 한 ${EMOTION_MAX_LENGTH}자 안쪽으로 쓴다.`,
    "- intensity: 0부터 5 사이 정수다. 감정의 강도와 표현의 강도를 함께 본다.",
    "- 0은 감정이 거의 없고 정보 전달 중심인 상태다.",
    "- 1은 약한 감정이나 가벼운 상태 언급이다.",
    "- 2는 감정이 보이지만 비교적 안정적인 상태다.",
    "- 3은 감정이 분명하고 답변에 영향을 줄 정도다.",
    "- 4는 감정이 강하게 드러나고 남아 있는 상태다.",
    "- 5는 매우 강한 감정 상태다.",
    "- 최신 메시지 표현뿐 아니라 최근 6턴에서 같은 감정이 이어지는지도 함께 본다.",
    "- desiredResponseMode는 humanReactionStyle이다.",
    "- 사용자의 말에 대해 가까운 사람이 보일 법한 자연스러운 반응 결을 고른다.",
    "- 상담 기법, 해결 전략, 말투 지시가 아니라 사람다운 받아주는 방식이다.",
    "- desiredResponseMode는 AI가 다음 답변에서 취해야 할 반응 방식이다.",
    "- primaryIntent와 비슷해 보여도 같은 의미를 반복하지 않는다.",
    "- 가장 직접적인 반응 방식 하나만 고른다.",
    "- 아래 값 중 하나만 선택한다.",
    "- casually_receive: 깊게 파고들지 않고 가볍고 자연스럽게 받아주면 되는 상태.",
    "- continue_the_mood: 사용자가 만든 감정이나 장난의 분위기를 깨지 않고 그대로 이어가는 게 중요한 상태.",
    "- show_small_care: 감정보다 밥, 잠, 몸, 퇴근, 날씨 같은 생활감 있는 챙김이 자연스러운 상태.",
    "- make_room_to_talk: 사용자가 더 말하고 싶어 할 가능성이 있어, 말을 많이 채우기보다 여지를 남기는 게 자연스러운 상태.",
    "- stay_close_quietly: 말로 정리하거나 해결하려 하기보다, 조용히 곁에 있는 느낌이 필요한 상태.",
    "- take_user_side_plainly: 억울함, 서운함, 분노가 있어 복잡한 분석보다 먼저 사용자 편에 서는 게 자연스러운 상태.",
    "- recognize_effort: 사용자가 버틴 것, 해낸 것, 애쓴 것을 알아봐주는 게 자연스러운 상태.",
    "- give_one_realistic_word: 사용자가 방향을 묻고 있어 길게 설명하기보다 현실적인 한마디나 작은 다음 단계가 필요한 상태.",
    "- ask_like_curious_person: 사용자가 더 말할 단서를 줬고, 질문 하나가 대화를 자연스럽게 살리는 상태.",
    "- playfully_push_and_pull: 장난, 농담, 티키타카 흐름이라 가볍게 밀고 당기는 반응이 자연스러운 상태.",
    "- receive_affection_warmly: 보고 싶음, 설렘, 애정 표현이 있어 따뜻하게 받아주는 게 자연스러운 상태.",
    "- miss_together: 그리움이나 상실감이 있어 같이 보고 싶어하는 흐름이 자연스러운 상태.",
    "- bring_up_memory_piece: 추억의 단서가 있어 구체적인 기억 한 조각을 꺼내는 게 자연스러운 상태.",
    "- check_unclear_message: 입력이 깨졌거나 너무 애매해서, 딱딱하게 오류 처리하지 말고 자연스럽게 다시 확인하는 게 필요한 상태.",
    `- unfinishedPoint: object 형식으로 쓴다. 최근 6턴 안에서 이미 등장했고, 최신 메시지 이전에도 이어졌고, 지금도 완전히 정리되지 않았으며, 이번 답변에 실제 영향을 줄 때만 status를 "present"로 쓴다. 최신 메시지, topic, primaryIntent를 다시 말한 값은 쓰지 않는다. 현재 턴에서 처음 나온 내용만으로는 만들지 않는다. 애매하면 status는 "none"이고 value는 반드시 JSON null이다. "없음", "해당 없음", "null" 같은 placeholder 문자열은 절대 쓰지 않는다. value는 가능한 한 ${UNFINISHED_POINT_MAX_LENGTH}자 안쪽으로 쓴다.`,
    `- textQuality: 입력 품질을 짧은 한국어 라벨로 쓴다. 문장이 분명한지, 오타가 있는지, 파편적인지, 난타형 입력인지 판단한다. 가능한 한 ${TEXT_QUALITY_MAX_LENGTH}자 안쪽으로 쓴다.`,
    `- reason: 왜 그렇게 판단했는지 한국어 한 문장으로만 쓴다. 길게 설명하지 않는다. 가능한 한 ${REASON_MAX_LENGTH}자 안쪽으로 쓴다.`,
    "",
    "금지:",
    "- 예시 문장을 따라 쓰지 않는다.",
    "- 사용자에게 답하지 않는다.",
    "- 상담사처럼 정리하지 않는다.",
    "- 분석 필드에 긴 문장을 쓰지 않는다.",
    "- 같은 의미를 과하게 멋있거나 추상적으로 포장하지 않는다.",
    "- 따옴표, 괄호, 불필요한 기호를 남발하지 않는다.",
    "",
    "출력 스키마:",
    '{',
    '  "topic": "string | null",',
    '  "topicShift": "same_topic | soft_shift | hard_shift",',
    '  "primaryIntent": "string",',
    '  "emotion": "string",',
    '  "intensity": 0,',
    '  "desiredResponseMode": "one of the fixed humanReactionStyle values",',
    '  "unfinishedPoint": {',
    '    "status": "present | none",',
    '    "value": "string | null"',
    "  },",
    '  "textQuality": "string",',
    '  "reason": "string"',
    '}',
  ].join("\n");
}

function buildUserPayload(params: {
  runtimeData: PersonaRuntime;
  alias?: string | null;
  previousAnalysis: PreviousTurnAnalysis | null;
  recentMessages: InferTurnAnalysisInput["recentMessages"];
  currentUserMessageContent: string;
}) {
  return {
    persona: buildPersonaPayload(params.runtimeData, params.alias),
    previousAnalysis: params.previousAnalysis,
    recentMessages: params.recentMessages,
    currentUserMessage: params.currentUserMessageContent,
  };
}

export async function inferTurnAnalysis({
  client,
  runtimeData,
  relationGroup: _relationGroup,
  recentMessages,
  currentUserMessageContent,
  alias,
  previousAnalysis,
}: InferTurnAnalysisInput): Promise<InferTurnAnalysisResult> {
  const fallback = buildFallbackTurnAnalysis();
  const model = OPENAI_TURN_ANALYSIS_MODEL || OPENAI_LABEL_MODEL;
  const basePayload = buildUserPayload({
    runtimeData,
    alias,
    previousAnalysis,
    recentMessages,
    currentUserMessageContent,
  });

  try {
    const createTurnAnalysis = async (payload: unknown) => {
      const completion = await client.chat.completions.create({
        model,
        max_completion_tokens: 320,
        response_format: TURN_ANALYSIS_RESPONSE_FORMAT,
        ...(isGpt5FamilyModel(model) ? {} : { temperature: 0.1 }),
        messages: [
          { role: "system", content: buildSystemPrompt() },
          {
            role: "user",
            content: JSON.stringify(payload, null, 2),
          },
        ],
      });

      const rawContent = completion.choices?.[0]?.message?.content?.trim() || "{}";
      const parsed = JSON.parse(rawContent);
      return parsed;
    };

    const firstParsed = await createTurnAnalysis(basePayload);
    const firstNormalized = normalizeTurnAnalysis(firstParsed, currentUserMessageContent);

    return {
      analysis: firstNormalized.analysis,
      rawAnalysis: firstParsed,
      model,
      validationIssues: firstNormalized.validationIssues,
    };
  } catch (error) {
    console.error("[turn-analysis] infer failed", error);
    return {
      analysis: fallback,
      rawAnalysis: { error: error instanceof Error ? error.message : "unknown error" },
      model,
      validationIssues: [],
    };
  }
}
