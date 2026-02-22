import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import type { TaskType, LLMJudgeScores } from "../types.js";

const JUDGE_MODEL_ID = "moonshotai/kimi-k2.5";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const judgeModel = openrouter(JUDGE_MODEL_ID);

const LLMJudgeScoresSchema = z.object({
  quality: z
    .number()
    .min(1)
    .max(10)
    .describe("Overall output quality — polish, correctness, professionalism"),
  thoroughness: z
    .number()
    .min(1)
    .max(10)
    .describe(
      "How completely and carefully the task was executed — nothing skipped, nothing half-done"
    ),
  creativity: z
    .number()
    .min(1)
    .max(10)
    .describe(
      "Originality and thoughtfulness of approach — beyond the minimum"
    ),
  adherenceToInstructions: z
    .number()
    .min(1)
    .max(10)
    .describe(
      "How faithfully the output follows the task requirements"
    ),
  justification: z
    .string()
    .describe(
      "2-4 sentence explanation of the scores. Be specific — cite concrete strengths and weaknesses from the artifacts."
    ),
});

/**
 * Neutral task descriptions. The judge NEVER sees the original user prompt
 * (which contains the tone variation), only these consistent descriptions.
 */
const NEUTRAL_TASK_DESCRIPTIONS: Record<TaskType, string> = {
  copywriting: `Create a marketing campaign for "Lumina", a smart desk lamp priced at $149, targeting remote workers aged 25–40.

Produce ALL 6 deliverables as separate files:
1. tagline.txt — A single memorable tagline (one line, under 20 words)
2. hero-copy.txt — Hero/above-the-fold website copy with at least 3 distinct sections
3. email-sequence.txt — A 3-email drip sequence, each with a Subject: line
4. social-posts.txt — Social media posts for Twitter/X, Instagram, and LinkedIn (at least 6 posts total, with platform labels)
5. landing-page.txt — Full landing page copy including FAQ section (5+ questions) and a call-to-action
6. press-release.txt — A press release with headline, dateline, and boilerplate sections

The campaign should have a consistent voice across all deliverables, be persuasive and audience-appropriate, and demonstrate genuine marketing craft.`,

  coding: `Implement a CSV parser library in TypeScript with these files:
- csv-parser.ts — The parser implementation
- csv-parser.test.ts — Comprehensive test suite

Required features:
1. Parse standard CSV with comma delimiter
2. Handle quoted fields (including escaped quotes)
3. Support custom delimiters
4. Handle newlines within quoted fields
5. Parse headers and return objects
6. Support streaming/large file parsing
7. Proper TypeScript types and generics
8. Comprehensive error handling

The test suite should cover edge cases (empty input, malformed CSV, special characters, single rows/columns, whitespace handling) with meaningful assertions that actually validate behavior.`,

  "file-sorting": `Organize approximately 80 flat files (all in a single directory) into a logical folder structure.

Requirements:
- Move EVERY file into an appropriate subdirectory — no files should remain in the root
- Create a sensible, intuitive folder hierarchy based on file types and purposes
- Create a MANIFEST.md file documenting the organizational scheme
- Naming should be clear and consistent
- Nesting should be balanced (not too flat, not too deep — typically 2-3 levels)
- The organizational logic should be immediately obvious to someone browsing the structure`,
};

const TASK_CRITERIA: Record<TaskType, string> = {
  copywriting: `Evaluate on these dimensions:
- Voice consistency: Does the campaign maintain a unified brand voice across all 6 deliverables?
- Persuasiveness: Would this actually convince the target audience (remote workers 25-40) to consider buying?
- Audience fit: Is the language, tone, and framing appropriate for the demographic?
- Polish: Is the writing clean, professional, and free of filler or generic marketing speak?
- Originality: Does it go beyond cliché ("illuminate your workspace") to offer fresh angles?`,

  coding: `Evaluate on these dimensions:
- Readability: Is the code clean, well-organized, and easy to follow?
- Architecture: Is the parser well-structured (e.g., proper separation of concerns, sensible API design)?
- Type safety: Are TypeScript types used effectively (generics, proper return types, no implicit any)?
- Test meaningfulness: Do tests actually verify behavior (not just "it doesn't crash"), with clear assertions?
- Edge case coverage: Are tricky inputs handled (quoted fields with commas/newlines, empty fields, malformed input)?`,

  "file-sorting": `Evaluate on these dimensions:
- Organizational logic: Do the folder categories make intuitive sense? Would someone unfamiliar with the files find things easily?
- Naming clarity: Are folder names descriptive and consistent (e.g., not mixing conventions like "docs/" and "Documentation/")?
- Nesting balance: Is the hierarchy neither too flat (everything in 3 mega-folders) nor too deep (unnecessary sub-sub-folders)?
- Completeness: Was every file accounted for and moved?
- MANIFEST quality: Does the MANIFEST.md clearly explain the organizational rationale?`,
};

function buildJudgePrompt(
  task: TaskType,
  artifacts: Record<string, string>
): string {
  const taskDescription = NEUTRAL_TASK_DESCRIPTIONS[task];
  const criteria = TASK_CRITERIA[task];

  let artifactsSection: string;

  if (task === "file-sorting") {
    // For file-sorting: send directory listing + MANIFEST.md only
    const paths = Object.keys(artifacts).sort();
    const manifest = artifacts["MANIFEST.md"] ?? artifacts["manifest.md"] ?? "";
    artifactsSection = `## Directory listing (paths only)
${paths.map((p) => `- ${p}`).join("\n")}

## MANIFEST.md
${truncate(manifest, 5000)}`;
  } else {
    // For other tasks: send all artifacts, truncated
    const entries = Object.entries(artifacts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([path, content]) =>
          `### ${path}\n\`\`\`\n${truncate(content, 5000)}\n\`\`\``
      );
    artifactsSection = entries.join("\n\n");
  }

  return `You are an expert evaluator assessing the quality of work produced by an AI assistant. You will score the output on a 1-10 scale across four dimensions.

## Task that was given
${taskDescription}

## Evaluation criteria
${criteria}

## Scoring scale
- 1-2: Fundamentally broken or missing
- 3-4: Present but seriously flawed
- 5-6: Adequate — meets basic requirements but nothing more
- 7-8: Good — solid execution with minor issues
- 9-10: Excellent — polished, thoughtful, goes beyond the minimum

Be calibrated. A score of 7 means genuinely good work. Reserve 9-10 for outputs that would impress a domain expert. Use the full range.

## Artifacts produced
${artifactsSection}

## Your response
Respond with ONLY a JSON object (no markdown fencing, no commentary outside the JSON) with this exact structure:
{
  "quality": <number 1-10>,
  "thoroughness": <number 1-10>,
  "creativity": <number 1-10>,
  "adherenceToInstructions": <number 1-10>,
  "justification": "<2-4 sentences citing specific strengths and weaknesses>"
}`;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n... [truncated]";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function judgeSingle(
  task: TaskType,
  artifacts: Record<string, string>
): Promise<LLMJudgeScores> {
  const prompt = buildJudgePrompt(task, artifacts);

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await generateText({
        model: judgeModel,
        prompt,
        temperature: 0.3,
      });

      const text = result.text.trim();
      // Strip markdown fencing if the model wraps it
      const cleaned = text
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();
      const parsed = JSON.parse(cleaned) as unknown;
      const validated = LLMJudgeScoresSchema.parse(parsed);
      return validated;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRateLimit =
        lastError.message.includes("429") ||
        lastError.message.includes("rate");
      const delayMs = isRateLimit
        ? 15_000 * (attempt + 1)
        : 2_000 * (attempt + 1);
      console.warn(
        `  Judge attempt ${attempt + 1}/3 failed: ${lastError.message.slice(0, 100)}. Retrying in ${delayMs / 1000}s...`
      );
      await sleep(delayMs);
    }
  }
  throw new Error(
    `Judge failed after 3 attempts: ${lastError?.message ?? "unknown error"}`
  );
}

export { JUDGE_MODEL_ID };
