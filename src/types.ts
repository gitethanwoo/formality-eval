export type ToneStyle = "casual" | "controlled" | "formal";
export type TaskType = "copywriting" | "coding" | "file-sorting";

export interface ModelConfig {
  id: string;
  provider: "anthropic" | "openai";
  label: string;
  tier: "large" | "small";
}

export interface EvalRunConfig {
  model: ModelConfig;
  tone: ToneStyle;
  task: TaskType;
  trial: number;
  maxSteps: number;
  runId: string;
}

export interface StepRecord {
  stepIndex: number;
  text: string;
  toolCalls: ToolCallRecord[];
  toolResults: ToolResultRecord[];
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  finishReason: string;
  durationMs: number;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultRecord {
  toolName: string;
  result: unknown;
}

export interface EvalRunResult {
  config: EvalRunConfig;
  /** The user prompt that was sent */
  prompt: string;
  steps: StepRecord[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalSteps: number;
  totalToolCalls: number;
  totalDurationMs: number;
  finalSandboxFiles: string[];
  /** Full file contents from the sandbox, keyed by relative path */
  artifacts: Record<string, string>;
  scores: AutomatedScores;
}

export interface AutomatedScores {
  // Coding
  testsWritten?: number;
  testsPassing?: number;
  testPassRate?: number;
  linesOfCode?: number;
  edgeCasesCovered?: number;

  // Copywriting
  deliverablesRequested?: number;
  deliverablesProduced?: number;
  completenessRate?: number;
  totalWordCount?: number;

  // File sorting
  totalFiles?: number;
  correctlyPlaced?: number;
  sortAccuracy?: number;
  filesUntouched?: number;
}

export interface LLMJudgeScores {
  quality: number;
  thoroughness: number;
  creativity: number;
  adherenceToInstructions: number;
  justification: string;
}
