export type Gender = "male" | "female";
export type UserGender = "male" | "female" | "other";
export type PrimaryGoal = "comfort" | "memory" | "unfinished_words" | "casual_talk" | "custom";

export type Step1Input = {
  userName: string;
  userGender: UserGender;
};

export type Step2Input = {
  primaryGoal: PrimaryGoal;
  customGoalText: string;
};

export type Step3Input = {
  personaName: string;
  relation: string;
  personaGender: Gender;
  avatarUrl: string | null;
  userNickname: string;
};

export type Step4Input = {
  conversationText: string;
  uploadedFileName: string | null;
  manualMode: boolean;
  manualSettings: {
    frequentPhrases: string[];
    nickname: string;
    tone: string;
    mood: string;
    emojiStyle: string;
  };
};

export type PersonaAnalyzeInput = {
  step1: Step1Input;
  step2: Step2Input;
  step3: Step3Input;
  step4: Step4Input;
};

export type PersonaAnalysis = {
  personaId: string;
  createdAt: string;
  updatedAt: string;

  userInput: {
    userName: string;
    userGender: UserGender;
  };

  personaInput: {
    displayName: string;
    relation: string;
    gender: Gender;
    avatarUrl: string | null;
    userNickname: string;
  };

  personaWorkStyle: {
    attitudeSummary: string;
    tendencyTags: string[];
    selfTalkStyle: string;
  };

  conversationIntent: {
    primaryGoal: PrimaryGoal;
    customGoalText: string;
  };

  sourceData: {
    sourceType: "chat_upload" | "manual_only";
    hasConversationText: boolean;
    hasManualSettings: boolean;
    uploadedFileName: string | null;
  };

  analysisSummary: {
    oneLineSummary: string;
    confidence: number;
    limitations: string[];
  };

  addressing: {
    callsUserAs: string[];
    userCallsPersonaAs: string[];
  };

  speechStyle: {
    baseTone: string[];
    politeness: string;
    sentenceLength: string;
    responseTempo: string;
    emotionalIntensity: string;
    humorStyle: string;
  };

  textHabits: {
    frequentPhrases: string[];
    frequentOpeners: string[];
    frequentClosers: string[];
    fillerWords: string[];
  };

  expressionStyle: {
    emojiEnabled: boolean;
    emojiExamples: string[];
    laughterPatterns: string[];
    sadnessPatterns: string[];
    typoExamples: string[];
  };

  conversationBehavior: {
    acknowledgementStyle: string;
    feedbackStyle: string;
    empathyFirst: boolean;
    asksBackFrequency: string;
    selfDisclosure: string;
    conflictStyle: string;
    preferredReplyLength: string;
  };

  topics: {
    frequent: string[];
    comfortTopics: string[];
    avoidTopics: string[];
  };

  memoryAnchors: {
    title: string;
    summary: string;
  }[];

  sampleReplies: string[];

  uncertainFields: {
    field: string;
    reason: string;
  }[];
};

export type PersonaRuntime = {
  personaId: string;
  displayName: string;
  relation: string;
  gender: Gender;
  goal: PrimaryGoal;
  customGoalText?: string;

  summary: string;

  style: {
    tone: string[];
    politeness: string;
    sentenceLength: string;
    replyTempo: string;
    humorStyle: string;
  };

  addressing: {
    callsUserAs: string[];
    userCallsPersonaAs: string[];
  };

  expressions: {
    frequentPhrases: string[];
    emojiExamples: string[];
    laughterPatterns: string[];
    sadnessPatterns: string[];
    typoExamples: string[];
  };

  personaMeta: {
    workAttitudeSummary: string;
    workTendencyTags: string[];
    selfTalkStyle: string;
  };

  behavior: {
    empathyFirst: boolean;
    feedbackStyle: string;
    preferredReplyLength: string;
    conflictStyle: string;
  };

  topics: {
    frequent: string[];
    avoid: string[];
  };

  memories: string[];

  sampleReplies: string[];

  uncertainty: string[];

  userProfile?: {
    age: number | null;
    mbti: string;
    interests: string[];
  };

  safety: {
    doNotClaimLiteralIdentity: true;
    doNotInventSpecificFacts: true;
  };
};
