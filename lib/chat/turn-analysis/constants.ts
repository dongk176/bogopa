import type { HumanReactionStyle, TopicShift } from "./types";

export const TURN_ANALYSIS_TAXONOMY_VERSION = "v2.6_topic_direct";

export const TOPIC_SHIFT_VALUES = ["same_topic", "soft_shift", "hard_shift"] as const satisfies readonly TopicShift[];
export const HUMAN_REACTION_STYLE_VALUES = [
  "casually_receive",
  "continue_the_mood",
  "show_small_care",
  "make_room_to_talk",
  "stay_close_quietly",
  "take_user_side_plainly",
  "recognize_effort",
  "give_one_realistic_word",
  "ask_like_curious_person",
  "playfully_push_and_pull",
  "receive_affection_warmly",
  "miss_together",
  "bring_up_memory_piece",
  "check_unclear_message",
] as const satisfies readonly HumanReactionStyle[];

export const TOPIC_MAX_LENGTH = 20;
export const INTENT_MAX_LENGTH = 24;
export const EMOTION_MAX_LENGTH = 12;
export const DESIRED_RESPONSE_MODE_MAX_LENGTH = 16;
export const UNFINISHED_POINT_MAX_LENGTH = 24;
export const TEXT_QUALITY_MAX_LENGTH = 18;
export const REASON_MAX_LENGTH = 120;

export const STORED_ANALYSIS_RISK_LEVEL = "none" as const;
export const STORED_ANALYSIS_CONFIDENCE = 0 as const;

export const FALLBACK_TURN_ANALYSIS = {
  topic: null,
  topicShift: "hard_shift",
  primaryIntent: "가볍게 말을 걸고 싶음",
  emotion: "중립",
  intensity: 0,
  desiredResponseMode: "casually_receive",
  unfinishedPoint: null,
  textQuality: "의미가 분명하지 않음",
  reason: "analysis_failed",
} as const;
