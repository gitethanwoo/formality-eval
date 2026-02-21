import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ModelConfig, ToneStyle, TaskType } from "./types.js";

export interface RuntimeModelConfig extends ModelConfig {
  model: LanguageModelV3;
}

export const MODELS: RuntimeModelConfig[] = [
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
    label: "Claude Opus 4.6",
    tier: "large",
    model: anthropic("claude-opus-4-6"),
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    tier: "small",
    model: anthropic("claude-haiku-4-5"),
  },
  {
    id: "gpt-5.2-codex",
    provider: "openai",
    label: "GPT-5.2 Codex",
    tier: "large",
    model: openai("gpt-5.2-codex"),
  },
  {
    id: "gpt-5.1-codex-mini",
    provider: "openai",
    label: "GPT-5.1 Codex Mini",
    tier: "small",
    model: openai("gpt-5.1-codex-mini"),
  },
];

export const TONES: ToneStyle[] = ["casual", "controlled", "formal"];
export const TASKS: TaskType[] = ["copywriting", "coding", "file-sorting"];

export const MAX_STEPS = 400;
