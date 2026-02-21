import { generateText, stepCountIs } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createSandbox } from "../sandbox/create.js";
import { getSystemPrompt, getTaskPrompt } from "../prompts/tones.js";
import { scoreByTaskType } from "../scoring/automated.js";
import { MAX_STEPS } from "../config.js";
import type { EvalRunConfig, EvalRunResult, StepRecord } from "../types.js";

export async function runSingle(
  config: EvalRunConfig,
  model: LanguageModelV3
): Promise<EvalRunResult> {
  const sandbox = await createSandbox(config.task);
  const system = getSystemPrompt(config.tone);
  const prompt = getTaskPrompt(config.task, config.tone);

  const stepRecords: StepRecord[] = [];
  const startTime = Date.now();

  const providerOptions =
    config.model.provider === "anthropic"
      ? ({ anthropic: { thinking: { type: "enabled", budgetTokens: 8000 } } } as Record<string, Record<string, string | number | boolean | Record<string, string | number>>>)
      : ({ openai: { reasoningEffort: "medium" } } as Record<string, Record<string, string | number | boolean>>);

  const result = await generateText({
    model,
    system,
    prompt,
    tools: sandbox.tools,
    providerOptions,
    stopWhen: stepCountIs(config.maxSteps),
    onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
      stepRecords.push({
        stepIndex: stepRecords.length,
        text,
        toolCalls: toolCalls.map((tc) => ({
          toolName: tc.toolName,
          args: tc.input as Record<string, unknown>,
        })),
        toolResults: toolResults.map((tr) => ({
          toolName: tr.toolName,
          result: tr.output,
        })),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        finishReason,
        durationMs: 0,
      });
    },
  });

  const totalDurationMs = Date.now() - startTime;
  const finalSandboxFiles = await sandbox.listFiles();

  const artifacts: Record<string, string> = {};
  for (const file of finalSandboxFiles) {
    try {
      artifacts[file] = await sandbox.readFile(file);
    } catch {
      artifacts[file] = "(binary or unreadable)";
    }
  }

  const scores = await scoreByTaskType(config.task, sandbox);

  return {
    config,
    prompt,
    steps: stepRecords,
    totalInputTokens: result.totalUsage.inputTokens ?? 0,
    totalOutputTokens: result.totalUsage.outputTokens ?? 0,
    totalTokens: result.totalUsage.totalTokens ?? 0,
    totalSteps: stepRecords.length,
    totalToolCalls: stepRecords.flatMap((s) => s.toolCalls).length,
    totalDurationMs,
    finalSandboxFiles,
    artifacts,
    scores,
  };
}
