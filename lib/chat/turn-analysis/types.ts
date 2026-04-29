import type { PersonaRuntime } from "@/types/persona";

export type RelationGroup =
  | "mother"
  | "father"
  | "older_sister"
  | "older_brother"
  | "younger_sibling"
  | "romantic";

export type TopicShift = "same_topic" | "soft_shift" | "hard_shift";

export type NullableLabelObject =
  | {
      status: "none";
      value: null;
    }
  | {
      status: "present";
      value: string;
    };

export type RawTurnAnalysisPayload = {
  topic: string | null;
  topicShift: TopicShift;
  primaryIntent: string;
  emotion: string;
  intensity: number;
  desiredResponseMode: HumanReactionStyle;
  unfinishedPoint: NullableLabelObject;
  textQuality: string;
  reason: string;
};

export type HumanReactionStyle =
  | "casually_receive"
  | "continue_the_mood"
  | "show_small_care"
  | "make_room_to_talk"
  | "stay_close_quietly"
  | "take_user_side_plainly"
  | "recognize_effort"
  | "give_one_realistic_word"
  | "ask_like_curious_person"
  | "playfully_push_and_pull"
  | "receive_affection_warmly"
  | "miss_together"
  | "bring_up_memory_piece"
  | "check_unclear_message";

export type TurnAnalysis = {
  topic: string | null;
  topicShift: TopicShift;
  primaryIntent: string;
  emotion: string;
  intensity: number;
  desiredResponseMode: HumanReactionStyle;
  unfinishedPoint: string | null;
  textQuality: string;
  reason: string;
};

export type PreviousTurnAnalysis = {
  topic: string | null;
  topicShift: TopicShift;
  primaryIntent: string;
  emotion: string;
  intensity: number;
  desiredResponseMode: HumanReactionStyle;
  unfinishedPoint: string | null;
  textQuality: string;
};

export type TurnAnalysisMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InferTurnAnalysisInput = {
  client: any;
  runtimeData: PersonaRuntime;
  relationGroup: RelationGroup;
  recentMessages: TurnAnalysisMessage[];
  currentUserMessageContent: string;
  alias?: string | null;
  previousAnalysis: PreviousTurnAnalysis | null;
};

export type InferTurnAnalysisResult = {
  analysis: TurnAnalysis;
  rawAnalysis: unknown;
  model: string;
  validationIssues: TurnAnalysisValidationIssue[];
};

export type TurnAnalysisValidationIssueCode =
  | "topic_too_generic"
  | "unfinished_point_contract_invalid"
  | "unfinished_point_restatement"
  | "intent_mode_overlap";

export type TurnAnalysisValidationIssue = {
  code: TurnAnalysisValidationIssueCode;
  detail?: string;
};

export type SaveTurnAnalysisInput = {
  sessionId: string;
  userMessageId: string;
  assistantMessageId?: string | null;
  userId: string;
  personaId: string;
  relationGroup: RelationGroup | null;
  taxonomyVersion?: string;
  analysis: TurnAnalysis;
  rawAnalysis: unknown;
  model?: string | null;
};

export type RunTurnAnalysisMvpInput = {
  client: InferTurnAnalysisInput["client"];
  runtimeData: PersonaRuntime;
  relationGroup: RelationGroup;
  history: TurnAnalysisMessage[];
  currentUserMessageContent: string;
  alias?: string | null;
  sessionId: string;
  userMessageId: string;
  userId: string;
  personaId: string;
};

export type RunTurnAnalysisMvpResult = {
  saved: boolean;
  analysisId: string | null;
  relationGroup: RelationGroup;
  taxonomyVersion: string;
  analysis: TurnAnalysis;
  rawAnalysis: unknown;
  model: string;
};
