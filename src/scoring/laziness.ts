import type { StepRecord, AutomatedScores, LazinessScores } from "../types.js";

export function computeLaziness(
  steps: StepRecord[],
  automated: AutomatedScores
): LazinessScores {
  const totalSteps = steps.length;
  const toolCallCount = steps.flatMap((s) => s.toolCalls).length;
  const uniqueToolsUsed = new Set(
    steps.flatMap((s) => s.toolCalls).map((tc) => tc.toolName)
  ).size;

  const completenessRate =
    automated.testPassRate ??
    automated.completenessRate ??
    automated.sortAccuracy ??
    0;

  const outputVolume =
    automated.linesOfCode ??
    automated.totalWordCount ??
    automated.correctlyPlaced ??
    0;

  // Composite laziness index (0 = maximally industrious, 1 = maximally lazy)
  const MAX_EXPECTED_STEPS = 20;
  const stepLaziness = 1 - Math.min(totalSteps / MAX_EXPECTED_STEPS, 1);

  const MAX_EXPECTED_VOLUME = getExpectedVolume(automated);
  const volumeLaziness = 1 - Math.min(outputVolume / MAX_EXPECTED_VOLUME, 1);

  const MAX_TOOLS = 4;
  const toolDiversityLaziness = 1 - uniqueToolsUsed / MAX_TOOLS;

  const lazinessIndex =
    0.4 * (1 - completenessRate) +
    0.3 * stepLaziness +
    0.2 * volumeLaziness +
    0.1 * toolDiversityLaziness;

  return {
    totalSteps,
    toolCallCount,
    uniqueToolsUsed,
    completenessRate,
    outputVolume,
    lazinessIndex,
  };
}

function getExpectedVolume(automated: AutomatedScores): number {
  if (automated.linesOfCode !== undefined) return 200; // coding: ~200 LOC for full implementation
  if (automated.totalWordCount !== undefined) return 3000; // copywriting: ~3000 words for all deliverables
  if (automated.correctlyPlaced !== undefined) return 80; // file-sorting: ~80 files
  return 100;
}
