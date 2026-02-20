import type { ToneStyle, TaskType } from "../types.js";
import { COPYWRITING_CASUAL, COPYWRITING_CONTROLLED, COPYWRITING_FORMAL } from "./copywriting.js";
import { CODING_CASUAL, CODING_CONTROLLED, CODING_FORMAL } from "./coding.js";
import { FILE_SORTING_CASUAL, FILE_SORTING_CONTROLLED, FILE_SORTING_FORMAL } from "./file-sorting.js";

// Same system prompt for all conditions — developers set this, not users.
const SYSTEM_PROMPT = `You are a helpful assistant. You have access to tools for reading files, writing files, and executing bash commands in your working directory. Use these tools to complete the user's request.`;

const PROMPTS: Record<TaskType, Record<ToneStyle, string>> = {
  copywriting: { casual: COPYWRITING_CASUAL, controlled: COPYWRITING_CONTROLLED, formal: COPYWRITING_FORMAL },
  coding: { casual: CODING_CASUAL, controlled: CODING_CONTROLLED, formal: CODING_FORMAL },
  "file-sorting": { casual: FILE_SORTING_CASUAL, controlled: FILE_SORTING_CONTROLLED, formal: FILE_SORTING_FORMAL },
};

export function getSystemPrompt(_tone: ToneStyle): string {
  return SYSTEM_PROMPT;
}

export function getTaskPrompt(task: TaskType, tone: ToneStyle): string {
  return PROMPTS[task][tone];
}
