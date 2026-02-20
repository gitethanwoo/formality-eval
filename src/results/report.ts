import type { EvalRunResult } from "../types.js";

export function generateReport(results: EvalRunResult[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("  FORMALITY vs LAZINESS: EVAL RESULTS");
  console.log("=".repeat(80) + "\n");

  // Group by model
  const byModel = new Map<string, EvalRunResult[]>();
  for (const r of results) {
    const key = r.config.model.label;
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key)!.push(r);
  }

  // Summary table
  console.log(
    padRight("Model", 22) +
      padRight("Tone", 10) +
      padRight("Task", 16) +
      padRight("Steps", 8) +
      padRight("Tools", 8) +
      padRight("Tokens", 10) +
      padRight("Laziness", 10) +
      padRight("Complete", 10)
  );
  console.log("-".repeat(94));

  for (const [model, runs] of byModel) {
    for (const r of runs) {
      console.log(
        padRight(model, 22) +
          padRight(r.config.tone, 10) +
          padRight(r.config.task, 16) +
          padRight(String(r.totalSteps), 8) +
          padRight(String(r.totalToolCalls), 8) +
          padRight(String(r.totalTokens), 10) +
          padRight(r.scores.laziness.lazinessIndex.toFixed(3), 10) +
          padRight(r.scores.laziness.completenessRate.toFixed(2), 10)
      );
    }
  }

  // Casual vs Formal comparison
  console.log("\n" + "=".repeat(80));
  console.log("  CASUAL vs FORMAL DELTA (positive = casual is lazier/worse)");
  console.log("=".repeat(80) + "\n");

  const models = [...new Set(results.map((r) => r.config.model.label))];
  const tasks = [...new Set(results.map((r) => r.config.task))];

  console.log(
    padRight("Model", 22) +
      padRight("Task", 16) +
      padRight("Laz Delta", 12) +
      padRight("Steps Delta", 12) +
      padRight("Comp Delta", 12)
  );
  console.log("-".repeat(74));

  for (const model of models) {
    for (const task of tasks) {
      const casual = results.find(
        (r) =>
          r.config.model.label === model &&
          r.config.task === task &&
          r.config.tone === "casual"
      );
      const formal = results.find(
        (r) =>
          r.config.model.label === model &&
          r.config.task === task &&
          r.config.tone === "formal"
      );

      if (casual && formal) {
        const lazDelta =
          casual.scores.laziness.lazinessIndex -
          formal.scores.laziness.lazinessIndex;
        const stepsDelta = casual.totalSteps - formal.totalSteps;
        const compDelta =
          casual.scores.laziness.completenessRate -
          formal.scores.laziness.completenessRate;

        console.log(
          padRight(model, 22) +
            padRight(task, 16) +
            padRight(formatDelta(lazDelta), 12) +
            padRight(formatDelta(stepsDelta), 12) +
            padRight(formatDelta(compDelta), 12)
        );
      }
    }
  }

  console.log("");
}

function padRight(str: string, len: number): string {
  return str.padEnd(len);
}

function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(3)}`;
}
