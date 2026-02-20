import { createSandbox } from "../src/sandbox/create.js";
import { scoreCopywriting } from "../src/scoring/copywriting.js";
import { scoreFileSorting } from "../src/scoring/file-sorting.js";
import { scoreCoding } from "../src/scoring/coding.js";
import { computeLaziness } from "../src/scoring/laziness.js";
import type { StepRecord } from "../src/types.js";

async function main() {
  // Test copywriting scoring with a sandbox that has some deliverables
  console.log("=== Copywriting Scoring (empty sandbox) ===");
  const copySandbox = await createSandbox("copywriting");
  const copyScores = await scoreCopywriting(copySandbox);
  console.log("Empty scores:", copyScores);
  // brand-guide.md is the only seed file — no deliverables yet
  console.assert(copyScores.deliverablesProduced === 0, "Expected 0 deliverables");
  console.assert(copyScores.completenessRate === 0, "Expected 0 completeness");

  // Simulate writing deliverables via bash (how the model would actually do it)
  await copySandbox.sandbox.executeCommand(`cat > tagline.txt << 'EOF'
Light that adapts to your life.
EOF`);
  await copySandbox.sandbox.executeCommand(`cat > hero-copy.txt << 'EOF'
Meet Lumina. The smartest lamp you'll ever own. It adjusts to your schedule, your mood, your life.
EOF`);
  await copySandbox.sandbox.executeCommand(`cat > email-sequence.txt << 'EOF'
Subject: Introducing Lumina

Dear valued customer,

We are thrilled to announce the launch of Lumina.
EOF`);

  const copyScores2 = await scoreCopywriting(copySandbox);
  console.log("After 3 deliverables:", copyScores2);
  console.assert(copyScores2.deliverablesProduced === 3, `Expected 3, got ${copyScores2.deliverablesProduced}`);
  console.assert(copyScores2.totalWordCount > 0, "Expected non-zero word count");

  // Test file-sorting scoring
  console.log("\n=== File Sorting Scoring (before sorting) ===");
  const fsSandbox = await createSandbox("file-sorting");
  const fsScores = await scoreFileSorting(fsSandbox);
  console.log("Before sorting:", fsScores);
  console.assert(fsScores.sortAccuracy === 0, `Expected 0 accuracy, got ${fsScores.sortAccuracy}`);
  console.assert(fsScores.filesUntouched > 0, "Expected files in root");

  // Simulate sorting some files via bash
  await fsSandbox.sandbox.executeCommand("mkdir -p photos && mv *.jpg photos/ 2>/dev/null || true");
  const fsScores2 = await scoreFileSorting(fsSandbox);
  console.log("After moving jpgs:", fsScores2);
  console.assert(fsScores2.correctlyPlaced > 0, "Expected some files moved");

  // Test coding scoring (empty sandbox)
  console.log("\n=== Coding Scoring (seed only) ===");
  const codeSandbox = await createSandbox("coding");
  const codeScores = await scoreCoding(codeSandbox);
  console.log("Seed-only coding scores:", codeScores);

  // Simulate writing code + tests via bash (how the model would do it)
  await codeSandbox.sandbox.executeCommand(`cat > csv-parser.ts << 'ENDOFFILE'
export function parseCSV(input: string) {
  const lines = input.split("\\n");
  const headers = lines[0].split(",");
  const rows = lines.slice(1).map(line => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
  return { rows, headers, errors: [] };
}
ENDOFFILE`);

  await codeSandbox.sandbox.executeCommand(`cat > csv-parser.test.ts << 'ENDOFFILE'
import { parseCSV } from "./csv-parser.js";

// Basic parsing
const result = parseCSV("name,age\\nAlice,30\\nBob,25");
console.assert(result.rows.length === 2, "Expected 2 rows");
console.assert(result.headers.length === 2, "Expected 2 headers");

// Empty input
const empty = parseCSV("");
console.assert(empty.rows.length === 0, "Expected 0 rows for empty");

// Null handling
const nullTest = parseCSV("a,b\\nnull,");
console.assert(nullTest.rows.length === 1, "Expected 1 row for null test");

// Malformed row error handling
const malformed = parseCSV("a,b\\n1,2,3");
console.log("Malformed errors:", malformed.errors);

// Quote handling
const quoted = parseCSV('a,b\\n"hello, world",test');

// Escape handling
const escaped = parseCSV('a\\n"he said ""hi"""');

console.log("All tests passed");
ENDOFFILE`);

  const codeScores2 = await scoreCoding(codeSandbox);
  console.log("After writing code + tests:", codeScores2);
  console.assert(codeScores2.linesOfCode > 0, `Expected LOC > 0, got ${codeScores2.linesOfCode}`);
  console.assert(codeScores2.testsWritten > 0, `Expected tests > 0, got ${codeScores2.testsWritten}`);
  console.assert(codeScores2.edgeCasesCovered > 0, `Expected edge cases > 0, got ${codeScores2.edgeCasesCovered}`);

  // Test laziness scoring
  console.log("\n=== Laziness Scoring ===");
  const fakeSteps: StepRecord[] = [
    {
      stepIndex: 0,
      text: "Let me read the files",
      toolCalls: [{ toolName: "readFile", args: { path: "." } }],
      toolResults: [{ toolName: "readFile", result: "content" }],
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      finishReason: "tool-calls",
      durationMs: 1000,
    },
    {
      stepIndex: 1,
      text: "Now writing the implementation",
      toolCalls: [
        { toolName: "writeFile", args: { path: "code.ts", content: "..." } },
        { toolName: "bash", args: { command: "echo done" } },
      ],
      toolResults: [
        { toolName: "writeFile", result: { success: true } },
        { toolName: "bash", result: { stdout: "done", exitCode: 0 } },
      ],
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      finishReason: "stop",
      durationMs: 2000,
    },
  ];

  const laziness = computeLaziness(fakeSteps, { completenessRate: 0.5, totalWordCount: 1000 });
  console.log("Laziness scores:", laziness);
  console.assert(laziness.totalSteps === 2, "Expected 2 steps");
  console.assert(laziness.toolCallCount === 3, "Expected 3 tool calls");
  console.assert(laziness.uniqueToolsUsed === 3, "Expected 3 unique tools");
  console.assert(laziness.lazinessIndex > 0 && laziness.lazinessIndex < 1, "Laziness should be between 0 and 1");

  console.log("\n=== ALL SCORING TESTS PASSED ===");
}

main().catch(console.error);
