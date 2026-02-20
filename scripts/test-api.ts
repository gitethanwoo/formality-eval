import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

async function main() {
  console.log("Testing OpenAI (gpt-5.1-codex-mini)...");
  try {
    const r1 = await generateText({
      model: openai("gpt-5.1-codex-mini"),
      prompt: "Say hello in exactly 3 words.",
      maxOutputTokens: 20,
    });
    console.log("  Response:", r1.text);
    console.log("  Tokens:", r1.usage.totalTokens);
  } catch (e: unknown) {
    console.error("  FAILED:", (e as Error).message);
  }

  console.log("\nTesting Anthropic (claude-haiku-4-5)...");
  try {
    const r2 = await generateText({
      model: anthropic("claude-haiku-4-5"),
      prompt: "Say hello in exactly 3 words.",
      maxOutputTokens: 20,
    });
    console.log("  Response:", r2.text);
    console.log("  Tokens:", r2.usage.totalTokens);
  } catch (e: unknown) {
    console.error("  FAILED:", (e as Error).message);
  }

  console.log("\nAPI tests done.");
}

main().catch(console.error);
