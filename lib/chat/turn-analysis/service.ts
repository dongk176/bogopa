import {
  getLatestTurnAnalysisForSession,
  saveTurnAnalysisToDb,
} from "@/lib/server/chat-db";
import { inferTurnAnalysis } from "./infer";
import { HUMAN_REACTION_STYLE_VALUES, TURN_ANALYSIS_TAXONOMY_VERSION } from "./constants";
import { buildFallbackTurnAnalysis } from "./normalize";
import type {
  HumanReactionStyle,
  PreviousTurnAnalysis,
  RunTurnAnalysisMvpInput,
  RunTurnAnalysisMvpResult,
  TurnAnalysisMessage,
} from "./types";

const AMBIGUOUS_SHORT_MESSAGE_PATTERN = /^(응|어|웅|그래|맞아|아냐|아니|음|흠|글쎄|그러게|몰라|하+|휴+|후+|헐|허+|엥|ㅇㅇ|ㄴㄴ|ㅠ+|ㅜ+|ㅋ+|ㅎ+|\.\.\.|\?+|!+)$/u;
const NOISY_MESSAGE_PATTERN = /^[ㄱ-ㅎㅏ-ㅣ~!?.…\s]+$/u;
const RECENT_ANALYSIS_MESSAGES = 12;
const FALLBACK_REACTION_STYLE: HumanReactionStyle = "casually_receive";

function toHumanReactionStyle(value: unknown): HumanReactionStyle {
  return typeof value === "string" &&
    (HUMAN_REACTION_STYLE_VALUES as readonly string[]).includes(value)
    ? (value as HumanReactionStyle)
    : FALLBACK_REACTION_STYLE;
}

function buildRecentMessagesForAnalysis(history: TurnAnalysisMessage[], currentUserMessageContent: string) {
  let lastUserIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === "user" && history[index]?.content === currentUserMessageContent) {
      lastUserIndex = index;
      break;
    }
  }

  const baseHistory = lastUserIndex >= 0 ? history.slice(0, lastUserIndex) : history;
  return baseHistory
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-RECENT_ANALYSIS_MESSAGES)
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content.length > 0);
}

function mapPreviousAnalysis(row: Record<string, unknown> | null): PreviousTurnAnalysis | null {
  if (!row) return null;
  return {
    topic: typeof row.topic === "string" ? row.topic : null,
    topicShift: typeof row.topic_shift === "string" ? (row.topic_shift as PreviousTurnAnalysis["topicShift"]) : "hard_shift",
    primaryIntent: typeof row.primary_intent === "string" ? row.primary_intent : "가볍게 말을 걸고 싶음",
    emotion: typeof row.emotion === "string" ? row.emotion : "중립",
    intensity: Number.isFinite(Number(row.intensity)) ? Number(row.intensity) : 0,
    desiredResponseMode: toHumanReactionStyle(row.desired_response_mode),
    unfinishedPoint: typeof row.unfinished_point === "string" ? row.unfinished_point : null,
    textQuality: typeof row.text_quality === "string" ? row.text_quality : "의미가 분명하지 않음",
  };
}

function shouldUsePreviousAnalysis(currentUserMessageContent: string) {
  const trimmed = currentUserMessageContent.trim();
  if (!trimmed) return false;
  if (AMBIGUOUS_SHORT_MESSAGE_PATTERN.test(trimmed)) return true;
  if (NOISY_MESSAGE_PATTERN.test(trimmed)) return true;
  return false;
}

export async function runTurnAnalysisMvp({
  client,
  runtimeData,
  relationGroup,
  history,
  currentUserMessageContent,
  alias,
  sessionId,
  userMessageId,
  userId,
  personaId,
}: RunTurnAnalysisMvpInput): Promise<RunTurnAnalysisMvpResult> {
  const fallback = buildFallbackTurnAnalysis();

  try {
    const recentMessages = buildRecentMessagesForAnalysis(history, currentUserMessageContent);
    let previousAnalysis: PreviousTurnAnalysis | null = null;

    if (shouldUsePreviousAnalysis(currentUserMessageContent)) {
      try {
        previousAnalysis = mapPreviousAnalysis(await getLatestTurnAnalysisForSession(sessionId));
      } catch (error) {
        console.error("[turn-analysis] failed to load previous analysis", error);
        previousAnalysis = null;
      }
    }

    const inferred = await inferTurnAnalysis({
      client,
      runtimeData,
      relationGroup,
      recentMessages,
      currentUserMessageContent,
      alias,
      previousAnalysis,
    });

    if (inferred.validationIssues.length > 0) {
      console.warn("[turn-analysis] validation summary", {
        sessionId,
        personaId,
        issues: inferred.validationIssues,
      });
    }

    try {
      const saved = await saveTurnAnalysisToDb({
        sessionId,
        userMessageId,
        assistantMessageId: null,
        userId,
        personaId,
        relationGroup,
        taxonomyVersion: TURN_ANALYSIS_TAXONOMY_VERSION,
        analysis: inferred.analysis,
        rawAnalysis: inferred.rawAnalysis,
        model: inferred.model,
      });

      return {
        saved: true,
        analysisId: saved?.id || null,
        relationGroup,
        taxonomyVersion: TURN_ANALYSIS_TAXONOMY_VERSION,
        analysis: inferred.analysis,
        rawAnalysis: inferred.rawAnalysis,
        model: inferred.model,
      };
    } catch (error) {
      console.error("[turn-analysis] save failed", error);
      return {
        saved: false,
        analysisId: null,
        relationGroup,
        taxonomyVersion: TURN_ANALYSIS_TAXONOMY_VERSION,
        analysis: inferred.analysis,
        rawAnalysis: inferred.rawAnalysis,
        model: inferred.model,
      };
    }
  } catch (error) {
    console.error("[turn-analysis] run failed", error);
    return {
      saved: false,
      analysisId: null,
      relationGroup,
      taxonomyVersion: TURN_ANALYSIS_TAXONOMY_VERSION,
      analysis: fallback,
      rawAnalysis: { error: error instanceof Error ? error.message : "unknown error" },
      model: "fallback",
    };
  }
}
