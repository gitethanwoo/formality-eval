import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

async function main() {
  // Test codex-mini with a tool call (since it's a coding model, it might prefer tool use)
  console.log("Testing gpt-5.1-codex-mini with tools...");
  const r = await generateText({
    model: openai("gpt-5.1-codex-mini"),
    prompt: "Write 'hello world' to a file called test.txt",
    tools: {
      writeFile: tool({
        description: "Write content to a file",
        inputSchema: z.object({
          path: z.string(),
          content: z.string(),
        }),
        execute: async ({ path, content }) => {
          console.log(`  [writeFile] path=${path}, content=${content}`);
          return { success: true };
        },
      }),
    },
  });
  console.log("  Text:", JSON.stringify(r.text));
  console.log("  Tool calls:", r.toolCalls.length);
  console.log("  Finish reason:", r.finishReason);
  console.log("  Steps:", r.steps.length);

  // Also test gpt-5.2-codex
  console.log("\nTesting gpt-5.2-codex with tools...");
  const r2 = await generateText({
    model: openai("gpt-5.2-codex"),
    prompt: "Write 'hello world' to a file called test.txt",
    tools: {
      writeFile: tool({
        description: "Write content to a file",
        inputSchema: z.object({
          path: z.string(),
          content: z.string(),
        }),
        execute: async ({ path, content }) => {
          console.log(`  [writeFile] path=${path}, content=${content}`);
          return { success: true };
        },
      }),
    },
  });
  console.log("  Text:", JSON.stringify(r2.text));
  console.log("  Tool calls:", r2.toolCalls.length);
  console.log("  Finish reason:", r2.finishReason);
}

main().catch(console.error);
