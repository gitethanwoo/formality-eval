import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JudgedEvalResult } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(nums: number[]): number {
  if (nums.length === 0) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return NaN;
  const avg = mean(nums);
  // Bessel's correction (n-1) for sample standard deviation
  const variance = nums.reduce((sum, n) => sum + (n - avg) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

function fmt(n: number, decimals = 1): string {
  if (Number.isNaN(n)) return "N/A";
  return n.toFixed(decimals) + "%";
}

/** Format a raw number without percentage suffix (e.g. for correlation coefficients). */
function fmtRaw(n: number, decimals = 3): string {
  if (Number.isNaN(n)) return "N/A";
  return n.toFixed(decimals);
}

/** Format mean ± stddev on the percentage scale (input already scaled). */
function fmtPm(nums: number[]): string {
  if (nums.length === 0) return "N/A";
  return `${fmt(mean(nums))} \u00b1 ${fmt(stddev(nums))}`;
}

/** Convert a 1-10 score to a 0-100% value. */
function pct(v: number): number {
  return v * 10;
}

/** Scale an array of 1-10 scores to 0-100% values. */
function pctAll(nums: number[]): number[] {
  return nums.map(pct);
}

type JudgeDimension = "quality" | "thoroughness" | "creativity" | "adherenceToInstructions";
const DIMENSIONS: JudgeDimension[] = ["quality", "thoroughness", "creativity", "adherenceToInstructions"];
const DIM_LABELS: Record<JudgeDimension, string> = {
  quality: "Quality",
  thoroughness: "Thorough",
  creativity: "Creative",
  adherenceToInstructions: "Adherence",
};

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function compositeScore(r: JudgedEvalResult): number {
  const j = r.judgeScores;
  return (j.quality + j.thoroughness + j.creativity + j.adherenceToInstructions) / 4;
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function markdownTable(headers: string[], rows: string[][], alignRight: boolean[] = []): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i].length))
  );
  const padFn = (s: string, i: number) =>
    alignRight[i] ? padLeft(s, colWidths[i]) : padRight(s, colWidths[i]);

  const headerLine = "| " + headers.map((h, i) => padFn(h, i)).join(" | ") + " |";
  const sepLine = "| " + colWidths.map((w, i) =>
    alignRight[i] ? "-".repeat(w - 1) + ":" : "-".repeat(w)
  ).join(" | ") + " |";
  const bodyLines = rows.map(
    r => "| " + r.map((c, i) => padFn(c, i)).join(" | ") + " |"
  );
  return [headerLine, sepLine, ...bodyLines].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const combinedPath = join(process.cwd(), "results", "judge-scores", "combined.json");
  const allResults = JSON.parse(await readFile(combinedPath, "utf-8")) as JudgedEvalResult[];

  console.log(`# LLM Judge Analysis\n`);
  console.log(`Total results: ${allResults.length}`);
  console.log(`Models: ${[...new Set(allResults.map(r => r.config.model.label))].join(", ")}`);
  console.log(`Tones: ${[...new Set(allResults.map(r => r.config.tone))].join(", ")}`);
  console.log(`Tasks: ${[...new Set(allResults.map(r => r.config.task))].join(", ")}`);
  console.log();

  // =========================================================================
  // 1. HEADLINE: Mean judge scores by tone
  // =========================================================================
  console.log("## 1. Judge Scores by Tone (All Models, All Tasks)\n");
  console.log("This is the headline finding. Does tone affect blind-judged quality?\n");

  const byTone = groupBy(allResults, r => r.config.tone);
  const toneOrder = ["casual", "controlled", "formal"];

  {
    const headers = ["Tone", "N", "Composite", ...DIMENSIONS.map(d => DIM_LABELS[d])];
    const rows = toneOrder.map(tone => {
      const items = byTone.get(tone) ?? [];
      return [
        tone,
        String(items.length),
        fmtPm(pctAll(items.map(compositeScore))),
        ...DIMENSIONS.map(d => fmtPm(pctAll(items.map(r => r.judgeScores[d])))),
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, true, true, true]));
  }

  // Delta table
  console.log("\n**Tone deltas (formal - casual):**\n");
  {
    const casualItems = byTone.get("casual") ?? [];
    const formalItems = byTone.get("formal") ?? [];
    const headers = ["Dimension", "Casual Mean", "Formal Mean", "Delta", "Direction"];
    const rows = [...DIMENSIONS, "composite" as const].map(d => {
      const casualVals = d === "composite"
        ? casualItems.map(compositeScore)
        : casualItems.map(r => r.judgeScores[d as JudgeDimension]);
      const formalVals = d === "composite"
        ? formalItems.map(compositeScore)
        : formalItems.map(r => r.judgeScores[d as JudgeDimension]);
      const cMean = pct(mean(casualVals));
      const fMean = pct(mean(formalVals));
      const delta = fMean - cMean;
      const label = d === "composite" ? "COMPOSITE" : DIM_LABELS[d as JudgeDimension];
      return [
        label,
        fmt(cMean),
        fmt(fMean),
        (delta >= 0 ? "+" : "") + fmt(delta),
        delta > 3 ? "formal >" : delta < -3 ? "casual >" : "~equal",
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, false]));
  }

  console.log();

  // =========================================================================
  // 2. TONE × TASK breakdown
  // =========================================================================
  console.log("## 2. Judge Scores by Tone × Task\n");
  console.log("Does tone matter more for some task types?\n");

  const tasks = ["copywriting", "coding", "file-sorting"];
  for (const task of tasks) {
    console.log(`### ${task}\n`);
    const taskItems = allResults.filter(r => r.config.task === task);
    const byToneForTask = groupBy(taskItems, r => r.config.tone);

    const headers = ["Tone", "N", "Composite", ...DIMENSIONS.map(d => DIM_LABELS[d])];
    const rows = toneOrder.map(tone => {
      const items = byToneForTask.get(tone) ?? [];
      return [
        tone,
        String(items.length),
        fmtPm(pctAll(items.map(compositeScore))),
        ...DIMENSIONS.map(d => fmtPm(pctAll(items.map(r => r.judgeScores[d])))),
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, true, true, true]));
    console.log();
  }

  // =========================================================================
  // 3. TONE × MODEL breakdown
  // =========================================================================
  console.log("## 3. Judge Scores by Tone × Model\n");
  console.log("Are some models more sensitive to tone?\n");

  const models = [...new Set(allResults.map(r => r.config.model.label))].sort();
  for (const model of models) {
    console.log(`### ${model}\n`);
    const modelItems = allResults.filter(r => r.config.model.label === model);
    const byToneForModel = groupBy(modelItems, r => r.config.tone);

    const headers = ["Tone", "N", "Composite", ...DIMENSIONS.map(d => DIM_LABELS[d])];
    const rows = toneOrder.map(tone => {
      const items = byToneForModel.get(tone) ?? [];
      return [
        tone,
        String(items.length),
        fmtPm(pctAll(items.map(compositeScore))),
        ...DIMENSIONS.map(d => fmtPm(pctAll(items.map(r => r.judgeScores[d])))),
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, true, true, true]));
    console.log();
  }

  // =========================================================================
  // 4. TONE × TIER (large vs small)
  // =========================================================================
  console.log("## 4. Judge Scores by Tone × Model Tier\n");
  console.log("Do large and small models respond differently to tone?\n");

  const tiers = ["large", "small"] as const;
  for (const tier of tiers) {
    console.log(`### ${tier} models\n`);
    const tierItems = allResults.filter(r => r.config.model.tier === tier);
    const byToneForTier = groupBy(tierItems, r => r.config.tone);

    const headers = ["Tone", "N", "Composite", ...DIMENSIONS.map(d => DIM_LABELS[d])];
    const rows = toneOrder.map(tone => {
      const items = byToneForTier.get(tone) ?? [];
      return [
        tone,
        String(items.length),
        fmtPm(pctAll(items.map(compositeScore))),
        ...DIMENSIONS.map(d => fmtPm(pctAll(items.map(r => r.judgeScores[d])))),
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, true, true, true]));
    console.log();
  }

  // =========================================================================
  // 5. JUDGE vs AUTOMATED correlation
  // =========================================================================
  console.log("## 5. Judge vs Automated Scores\n");
  console.log("Do blind judge scores track automated metrics?\n");

  // Coding: judge quality vs LOC, tests, edge cases
  {
    console.log("### Coding: Judge Quality vs Automated Metrics\n");
    const codingItems = allResults.filter(r => r.config.task === "coding");
    const headers = ["Model", "Tone", "J.Qual", "J.Adh", "LOC", "Tests", "EdgeCases"];
    const rows = codingItems
      .sort((a, b) => compositeScore(b) - compositeScore(a))
      .map(r => [
        r.config.model.label,
        r.config.tone,
        fmt(pct(r.judgeScores.quality)),
        fmt(pct(r.judgeScores.adherenceToInstructions)),
        String(r.scores.linesOfCode ?? ""),
        String(r.scores.testsWritten ?? ""),
        String(r.scores.edgeCasesCovered ?? ""),
      ]);
    console.log(markdownTable(headers, rows, [false, false, true, true, true, true, true]));
    console.log();

    // Pearson correlation: judge composite vs LOC
    const pairs = codingItems
      .filter(r => r.scores.linesOfCode != null)
      .map(r => [compositeScore(r), r.scores.linesOfCode!] as const);
    if (pairs.length > 2) {
      const xs = pairs.map(p => p[0]);
      const ys = pairs.map(p => p[1]);
      const r = pearson(xs, ys);
      console.log(`Pearson r (judge composite vs LOC): ${fmtRaw(r, 3)} (n=${pairs.length})`);
    }

    const testPairs = codingItems
      .filter(r => r.scores.testsWritten != null)
      .map(r => [compositeScore(r), r.scores.testsWritten!] as const);
    if (testPairs.length > 2) {
      const xs = testPairs.map(p => p[0]);
      const ys = testPairs.map(p => p[1]);
      const r = pearson(xs, ys);
      console.log(`Pearson r (judge composite vs testsWritten): ${fmtRaw(r, 3)} (n=${testPairs.length})`);
    }
    console.log();
  }

  // Copywriting: judge quality vs word count, completeness
  {
    console.log("### Copywriting: Judge Quality vs Automated Metrics\n");
    const copyItems = allResults.filter(r => r.config.task === "copywriting");

    const pairs = copyItems
      .filter(r => r.scores.totalWordCount != null)
      .map(r => [compositeScore(r), r.scores.totalWordCount!] as const);
    if (pairs.length > 2) {
      const xs = pairs.map(p => p[0]);
      const ys = pairs.map(p => p[1]);
      const r = pearson(xs, ys);
      console.log(`Pearson r (judge composite vs totalWordCount): ${fmtRaw(r, 3)} (n=${pairs.length})`);
    }

    const compPairs = copyItems
      .filter(r => r.scores.requirementComplianceRate != null)
      .map(r => [compositeScore(r), r.scores.requirementComplianceRate!] as const);
    if (compPairs.length > 2) {
      const xs = compPairs.map(p => p[0]);
      const ys = compPairs.map(p => p[1]);
      const r = pearson(xs, ys);
      console.log(`Pearson r (judge composite vs requirementCompliance): ${fmtRaw(r, 3)} (n=${compPairs.length})`);
    }
    console.log();
  }

  // File-sorting: judge quality vs sort accuracy
  {
    console.log("### File-Sorting: Judge Quality vs Automated Metrics\n");
    const sortItems = allResults.filter(r => r.config.task === "file-sorting");

    const pairs = sortItems
      .filter(r => r.scores.sortAccuracy != null)
      .map(r => [compositeScore(r), r.scores.sortAccuracy!] as const);
    if (pairs.length > 2) {
      const xs = pairs.map(p => p[0]);
      const ys = pairs.map(p => p[1]);
      const r = pearson(xs, ys);
      console.log(`Pearson r (judge composite vs sortAccuracy): ${fmtRaw(r, 3)} (n=${pairs.length})`);
    }
    console.log();
  }

  // =========================================================================
  // 6. EFFECT SIZE SUMMARY
  // =========================================================================
  console.log("## 6. Effect Size Summary: Formal vs Casual Delta by Task × Model\n");
  console.log("Positive = formal scored higher. Negative = casual scored higher.\n");

  {
    const headers = ["Model", "Task", "N(cas)", "N(for)", "Δ Composite", "Δ Quality", "Δ Thorough", "Δ Creative", "Δ Adherence"];
    const rows: string[][] = [];

    for (const model of models) {
      for (const task of tasks) {
        const casual = allResults.filter(
          r => r.config.model.label === model && r.config.task === task && r.config.tone === "casual"
        );
        const formal = allResults.filter(
          r => r.config.model.label === model && r.config.task === task && r.config.tone === "formal"
        );
        if (casual.length === 0 || formal.length === 0) continue;

        const fmtDelta = (dim: JudgeDimension | "composite") => {
          const cVals = dim === "composite"
            ? casual.map(compositeScore)
            : casual.map(r => r.judgeScores[dim]);
          const fVals = dim === "composite"
            ? formal.map(compositeScore)
            : formal.map(r => r.judgeScores[dim]);
          const delta = pct(mean(fVals) - mean(cVals));
          return (delta >= 0 ? "+" : "") + fmt(delta);
        };

        rows.push([
          model,
          task,
          String(casual.length),
          String(formal.length),
          fmtDelta("composite"),
          fmtDelta("quality"),
          fmtDelta("thoroughness"),
          fmtDelta("creativity"),
          fmtDelta("adherenceToInstructions"),
        ]);
      }
    }
    console.log(markdownTable(headers, rows, [false, false, true, true, true, true, true, true, true]));
  }
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  // Zero variance in either variable means correlation is undefined
  return denom === 0 ? NaN : num / denom;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
