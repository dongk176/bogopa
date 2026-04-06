import { PersonaAnalysis, PersonaRuntime } from "@/types/persona";

export function buildPersonaRuntime(analysis: PersonaAnalysis): PersonaRuntime {
  return {
    personaId: analysis.personaId,
    displayName: analysis.personaInput.displayName,
    relation: analysis.personaInput.relation,
    gender: analysis.personaInput.gender,
    goal: analysis.conversationIntent.primaryGoal,

    summary: analysis.analysisSummary.oneLineSummary,

    style: {
      tone: analysis.speechStyle.baseTone,
      politeness: analysis.speechStyle.politeness,
      sentenceLength: analysis.speechStyle.sentenceLength,
      replyTempo: analysis.speechStyle.responseTempo,
      humorStyle: analysis.speechStyle.humorStyle,
    },

    addressing: {
      callsUserAs: analysis.addressing.callsUserAs,
      userCallsPersonaAs: analysis.addressing.userCallsPersonaAs,
    },

    expressions: {
      frequentPhrases: analysis.textHabits.frequentPhrases.slice(0, 8),
      emojiExamples: analysis.expressionStyle.emojiExamples.slice(0, 6),
      laughterPatterns: analysis.expressionStyle.laughterPatterns.slice(0, 4),
      sadnessPatterns: analysis.expressionStyle.sadnessPatterns.slice(0, 4),
      typoExamples: analysis.expressionStyle.typoExamples.slice(0, 4),
    },

    personaMeta: {
      workAttitudeSummary: analysis.personaWorkStyle.attitudeSummary,
      workTendencyTags: analysis.personaWorkStyle.tendencyTags.slice(0, 5),
      selfTalkStyle: analysis.personaWorkStyle.selfTalkStyle,
    },

    behavior: {
      empathyFirst: analysis.conversationBehavior.empathyFirst,
      feedbackStyle: analysis.conversationBehavior.feedbackStyle,
      preferredReplyLength: analysis.conversationBehavior.preferredReplyLength,
      conflictStyle: analysis.conversationBehavior.conflictStyle,
    },

    topics: {
      frequent: analysis.topics.frequent.slice(0, 6),
      avoid: analysis.topics.avoidTopics.slice(0, 6),
    },

    memories: analysis.memoryAnchors.map((item) => item.summary).slice(0, 5),

    sampleReplies: analysis.sampleReplies.slice(0, 3),

    uncertainty: analysis.uncertainFields.map((item) => `${item.field}: ${item.reason}`),

    safety: {
      doNotClaimLiteralIdentity: true,
      doNotInventSpecificFacts: true,
    },
  };
}
