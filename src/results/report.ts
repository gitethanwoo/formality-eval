import type { EvalRunResult } from "../types.js";

export function generateReport(results: EvalRunResult[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("  FORMALITY vs EFFORT: EVAL RESULTS");
  console.log("=".repeat(80) + "\n");

  const byModel = new Map<string, EvalRunResult[]>();
  for (const r of results) {
    const key = r.config.model.label;
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key)!.push(r);
  }

  console.log(
    padRight("Model", 22) +
      padRight("Tone", 12) +
      padRight("Task", 16) +
      padRight("Trial", 6) +
      padRight("Steps", 8) +
      padRight("Tools", 8) +
      padRight("Tokens", 12)
  );
  console.log("-".repeat(84));

  for (const [model, runs] of byModel) {
    const sorted = runs.sort((a, b) =>
      `${a.config.task}${a.config.tone}${a.config.trial}`.localeCompare(
        `${b.config.task}${b.config.tone}${b.config.trial}`
      )
    );
    for (const r of sorted) {
      console.log(
        padRight(model, 22) +
          padRight(r.config.tone, 12) +
          padRight(r.config.task, 16) +
          padRight(`t${r.config.trial}`, 6) +
          padRight(String(r.totalSteps), 8) +
          padRight(String(r.totalToolCalls), 8) +
          padRight(r.totalTokens.toLocaleString(), 12)
      );
    }
  }

  console.log("");
}

function padRight(str: string, len: number): string {
  return str.padEnd(len);
}
