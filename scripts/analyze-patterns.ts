import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  EvalRunResult,
  JudgedEvalResult,
  ToneStyle,
  TaskType,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(nums: number[]): number {
  if (nums.length === 0) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fmtRaw(n: number, decimals = 3): string {
  if (Number.isNaN(n)) return "N/A";
  return n.toFixed(decimals);
}

function fmtNum(n: number, decimals = 1): string {
  if (Number.isNaN(n)) return "N/A";
  return n.toFixed(decimals);
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function markdownTable(
  headers: string[],
  rows: string[][],
  alignRight: boolean[] = [],
): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const padFn = (s: string, i: number) =>
    alignRight[i] ? padLeft(s, colWidths[i]) : padRight(s, colWidths[i]);

  const headerLine =
    "| " + headers.map((h, i) => padFn(h, i)).join(" | ") + " |";
  const sepLine =
    "| " +
    colWidths
      .map((w, i) => (alignRight[i] ? "-".repeat(w - 1) + ":" : "-".repeat(w)))
      .join(" | ") +
    " |";
  const bodyLines = rows.map(
    (r) => "| " + r.map((c, i) => padFn(c, i)).join(" | ") + " |",
  );
  return [headerLine, sepLine, ...bodyLines].join("\n");
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0,
    dx2 = 0,
    dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? NaN : num / denom;
}

/** Composite judge score on the 0-100 scale. */
function composite(r: JudgedEvalResult): number {
  const j = r.judgeScores;
  return (
    ((j.quality + j.thoroughness + j.creativity + j.adherenceToInstructions) /
      4) *
    10
  );
}

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function corrLabel(r: number): string {
  const abs = Math.abs(r);
  if (Number.isNaN(r)) return "N/A";
  if (abs < 0.1) return "negligible";
  if (abs < 0.3) return "weak";
  if (abs < 0.5) return "moderate";
  if (abs < 0.7) return "strong";
  return "very strong";
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface JoinedRecord {
  judge: JudgedEvalResult;
  raw: EvalRunResult;
}

async function loadAllData(): Promise<JoinedRecord[]> {
  const baseDir = join(process.cwd(), "results");

  // Load judge scores
  const combinedPath = join(baseDir, "judge-scores", "combined.json");
  const judged = JSON.parse(
    await readFile(combinedPath, "utf-8"),
  ) as JudgedEvalResult[];
  const judgeByRunId = new Map(judged.map((j) => [j.runId, j]));

  // Load raw results from all batch directories
  const entries = await readdir(baseDir, { withFileTypes: true });
  const batchDirs = entries.filter(
    (e) => e.isDirectory() && e.name !== "judge-scores",
  );

  const rawByRunId = new Map<string, EvalRunResult>();

  for (const dir of batchDirs) {
    const rawDir = join(baseDir, dir.name, "raw");
    let rawFiles: string[];
    try {
      rawFiles = (await readdir(rawDir)).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const file of rawFiles) {
      const data = JSON.parse(
        await readFile(join(rawDir, file), "utf-8"),
      ) as EvalRunResult;
      if (data.config.trial == null) continue;
      rawByRunId.set(data.config.runId, data);
    }
  }

  // Join on runId
  const joined: JoinedRecord[] = [];
  for (const [runId, judge] of judgeByRunId) {
    const raw = rawByRunId.get(runId);
    if (raw) {
      joined.push({ judge, raw });
    }
  }

  return joined;
}

// ---------------------------------------------------------------------------
// Analysis 5: Automated vs Judge Score Correlation by Tone
// ---------------------------------------------------------------------------

const TONES: ToneStyle[] = ["casual", "controlled", "formal"];
const TASKS: TaskType[] = ["coding", "copywriting", "file-sorting"];

function analyzeCorrelationByTone(data: JoinedRecord[]): void {
  console.log("## 5. Automated vs Judge Score Correlation by Tone\n");
  console.log(
    "Pearson r between composite judge score (0-100) and automated metrics, computed **per tone**.\n",
  );

  // Coding: composite vs linesOfCode, testsWritten
  console.log("### Coding: Judge Composite vs linesOfCode, testsWritten\n");
  {
    const codingData = data.filter((d) => d.judge.config.task === "coding");
    const headers = ["Tone", "N", "r(LOC)", "Strength", "r(Tests)", "Strength"];
    const rows: string[][] = [];

    for (const tone of TONES) {
      const items = codingData.filter((d) => d.judge.config.tone === tone);
      const locPairs = items.filter(
        (d) => d.judge.scores.linesOfCode != null,
      );
      const testPairs = items.filter(
        (d) => d.judge.scores.testsWritten != null,
      );

      const rLoc = pearson(
        locPairs.map((d) => composite(d.judge)),
        locPairs.map((d) => d.judge.scores.linesOfCode!),
      );
      const rTests = pearson(
        testPairs.map((d) => composite(d.judge)),
        testPairs.map((d) => d.judge.scores.testsWritten!),
      );

      rows.push([
        tone,
        String(items.length),
        fmtRaw(rLoc),
        corrLabel(rLoc),
        fmtRaw(rTests),
        corrLabel(rTests),
      ]);
    }

    // All tones combined
    const allCoding = codingData;
    const allLocR = pearson(
      allCoding
        .filter((d) => d.judge.scores.linesOfCode != null)
        .map((d) => composite(d.judge)),
      allCoding
        .filter((d) => d.judge.scores.linesOfCode != null)
        .map((d) => d.judge.scores.linesOfCode!),
    );
    const allTestR = pearson(
      allCoding
        .filter((d) => d.judge.scores.testsWritten != null)
        .map((d) => composite(d.judge)),
      allCoding
        .filter((d) => d.judge.scores.testsWritten != null)
        .map((d) => d.judge.scores.testsWritten!),
    );
    rows.push([
      "**ALL**",
      String(allCoding.length),
      fmtRaw(allLocR),
      corrLabel(allLocR),
      fmtRaw(allTestR),
      corrLabel(allTestR),
    ]);

    console.log(
      markdownTable(headers, rows, [false, true, true, false, true, false]),
    );
    console.log();
  }

  // Copywriting: composite vs totalWordCount, completenessRate
  console.log(
    "### Copywriting: Judge Composite vs totalWordCount, completenessRate\n",
  );
  {
    const copyData = data.filter(
      (d) => d.judge.config.task === "copywriting",
    );
    const headers = [
      "Tone",
      "N",
      "r(WordCount)",
      "Strength",
      "r(Completeness)",
      "Strength",
    ];
    const rows: string[][] = [];

    for (const tone of TONES) {
      const items = copyData.filter((d) => d.judge.config.tone === tone);
      const wcPairs = items.filter(
        (d) => d.judge.scores.totalWordCount != null,
      );
      const crPairs = items.filter(
        (d) => d.judge.scores.completenessRate != null,
      );

      const rWc = pearson(
        wcPairs.map((d) => composite(d.judge)),
        wcPairs.map((d) => d.judge.scores.totalWordCount!),
      );
      const rCr = pearson(
        crPairs.map((d) => composite(d.judge)),
        crPairs.map((d) => d.judge.scores.completenessRate!),
      );

      rows.push([
        tone,
        String(items.length),
        fmtRaw(rWc),
        corrLabel(rWc),
        fmtRaw(rCr),
        corrLabel(rCr),
      ]);
    }

    // All tones combined
    const allWcR = pearson(
      copyData
        .filter((d) => d.judge.scores.totalWordCount != null)
        .map((d) => composite(d.judge)),
      copyData
        .filter((d) => d.judge.scores.totalWordCount != null)
        .map((d) => d.judge.scores.totalWordCount!),
    );
    const allCrR = pearson(
      copyData
        .filter((d) => d.judge.scores.completenessRate != null)
        .map((d) => composite(d.judge)),
      copyData
        .filter((d) => d.judge.scores.completenessRate != null)
        .map((d) => d.judge.scores.completenessRate!),
    );
    rows.push([
      "**ALL**",
      String(copyData.length),
      fmtRaw(allWcR),
      corrLabel(allWcR),
      fmtRaw(allCrR),
      corrLabel(allCrR),
    ]);

    console.log(
      markdownTable(headers, rows, [false, true, true, false, true, false]),
    );
    console.log();
  }

  // File-sorting: composite vs sortAccuracy
  console.log("### File-Sorting: Judge Composite vs sortAccuracy\n");
  {
    const sortData = data.filter(
      (d) => d.judge.config.task === "file-sorting",
    );
    const headers = ["Tone", "N", "r(SortAccuracy)", "Strength"];
    const rows: string[][] = [];

    for (const tone of TONES) {
      const items = sortData.filter((d) => d.judge.config.tone === tone);
      const pairs = items.filter(
        (d) => d.judge.scores.sortAccuracy != null,
      );

      const r = pearson(
        pairs.map((d) => composite(d.judge)),
        pairs.map((d) => d.judge.scores.sortAccuracy!),
      );

      rows.push([tone, String(items.length), fmtRaw(r), corrLabel(r)]);
    }

    // All tones combined
    const allR = pearson(
      sortData
        .filter((d) => d.judge.scores.sortAccuracy != null)
        .map((d) => composite(d.judge)),
      sortData
        .filter((d) => d.judge.scores.sortAccuracy != null)
        .map((d) => d.judge.scores.sortAccuracy!),
    );
    rows.push([
      "**ALL**",
      String(sortData.length),
      fmtRaw(allR),
      corrLabel(allR),
    ]);

    console.log(
      markdownTable(headers, rows, [false, true, true, false]),
    );
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Analysis 6: Step Count and Tool Call Patterns
// ---------------------------------------------------------------------------

function analyzeStepPatterns(data: JoinedRecord[]): void {
  console.log("## 6. Step Count and Tool Call Patterns\n");

  // 6a: By Tone x Task
  console.log("### 6a. Mean totalSteps, totalToolCalls, and toolCalls/step by Tone x Task\n");
  {
    const headers = [
      "Task",
      "Tone",
      "N",
      "Mean Steps",
      "Mean ToolCalls",
      "ToolCalls/Step",
    ];
    const rows: string[][] = [];

    for (const task of TASKS) {
      for (const tone of TONES) {
        const items = data.filter(
          (d) => d.raw.config.task === task && d.raw.config.tone === tone,
        );
        if (items.length === 0) continue;

        const steps = items.map((d) => d.raw.totalSteps);
        const calls = items.map((d) => d.raw.totalToolCalls);
        const ratio = items.map((d) =>
          d.raw.totalSteps > 0
            ? d.raw.totalToolCalls / d.raw.totalSteps
            : 0,
        );

        rows.push([
          task,
          tone,
          String(items.length),
          fmtNum(mean(steps)),
          fmtNum(mean(calls)),
          fmtRaw(mean(ratio), 2),
        ]);
      }
    }

    console.log(
      markdownTable(headers, rows, [false, false, true, true, true, true]),
    );
    console.log();
  }

  // 6b: Tone-level summary (all tasks)
  console.log("### 6b. Tone-Level Summary (All Tasks Aggregated)\n");
  {
    const headers = [
      "Tone",
      "N",
      "Mean Steps",
      "Mean ToolCalls",
      "ToolCalls/Step",
    ];
    const rows: string[][] = [];

    for (const tone of TONES) {
      const items = data.filter((d) => d.raw.config.tone === tone);
      const steps = items.map((d) => d.raw.totalSteps);
      const calls = items.map((d) => d.raw.totalToolCalls);
      const ratio = items.map((d) =>
        d.raw.totalSteps > 0
          ? d.raw.totalToolCalls / d.raw.totalSteps
          : 0,
      );

      rows.push([
        tone,
        String(items.length),
        fmtNum(mean(steps)),
        fmtNum(mean(calls)),
        fmtRaw(mean(ratio), 2),
      ]);
    }

    console.log(
      markdownTable(headers, rows, [false, true, true, true, true]),
    );
    console.log();
  }

  // 6c: By Tone x Model
  console.log("### 6c. Step and Tool Call Patterns by Tone x Model\n");
  {
    const models = [
      ...new Set(data.map((d) => d.raw.config.model.label)),
    ].sort();

    const headers = [
      "Model",
      "Tone",
      "N",
      "Mean Steps",
      "Mean ToolCalls",
      "ToolCalls/Step",
    ];
    const rows: string[][] = [];

    for (const model of models) {
      for (const tone of TONES) {
        const items = data.filter(
          (d) =>
            d.raw.config.model.label === model && d.raw.config.tone === tone,
        );
        if (items.length === 0) continue;

        const steps = items.map((d) => d.raw.totalSteps);
        const calls = items.map((d) => d.raw.totalToolCalls);
        const ratio = items.map((d) =>
          d.raw.totalSteps > 0
            ? d.raw.totalToolCalls / d.raw.totalSteps
            : 0,
        );

        rows.push([
          model,
          tone,
          String(items.length),
          fmtNum(mean(steps)),
          fmtNum(mean(calls)),
          fmtRaw(mean(ratio), 2),
        ]);
      }
    }

    console.log(
      markdownTable(headers, rows, [false, false, true, true, true, true]),
    );
    console.log();
  }

  // 6d: By Tone x Model x Task (full granularity)
  console.log("### 6d. Full Breakdown: Tone x Model x Task\n");
  {
    const models = [
      ...new Set(data.map((d) => d.raw.config.model.label)),
    ].sort();

    const headers = [
      "Model",
      "Task",
      "Tone",
      "N",
      "Mean Steps",
      "Mean ToolCalls",
      "TC/Step",
    ];
    const rows: string[][] = [];

    for (const model of models) {
      for (const task of TASKS) {
        for (const tone of TONES) {
          const items = data.filter(
            (d) =>
              d.raw.config.model.label === model &&
              d.raw.config.task === task &&
              d.raw.config.tone === tone,
          );
          if (items.length === 0) continue;

          const steps = items.map((d) => d.raw.totalSteps);
          const calls = items.map((d) => d.raw.totalToolCalls);
          const ratio = items.map((d) =>
            d.raw.totalSteps > 0
              ? d.raw.totalToolCalls / d.raw.totalSteps
              : 0,
          );

          rows.push([
            model,
            task,
            tone,
            String(items.length),
            fmtNum(mean(steps)),
            fmtNum(mean(calls)),
            fmtRaw(mean(ratio), 2),
          ]);
        }
      }
    }

    console.log(
      markdownTable(
        headers,
        rows,
        [false, false, false, true, true, true, true],
      ),
    );
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

function printFindings(data: JoinedRecord[]): void {
  console.log("---\n");

  // --------------- FINDING 5 ---------------
  console.log("### FINDING_5: Automated vs Judge Score Correlation by Tone\n");

  // Compute the key correlations needed for the finding
  const codingData = data.filter((d) => d.judge.config.task === "coding");
  const copyData = data.filter((d) => d.judge.config.task === "copywriting");
  const sortData = data.filter((d) => d.judge.config.task === "file-sorting");

  // Build summary data for coding correlations by tone
  const codingCorrs: { tone: string; rLoc: number; rTests: number }[] = [];
  for (const tone of TONES) {
    const items = codingData.filter((d) => d.judge.config.tone === tone);
    const locItems = items.filter((d) => d.judge.scores.linesOfCode != null);
    const testItems = items.filter(
      (d) => d.judge.scores.testsWritten != null,
    );
    codingCorrs.push({
      tone,
      rLoc: pearson(
        locItems.map((d) => composite(d.judge)),
        locItems.map((d) => d.judge.scores.linesOfCode!),
      ),
      rTests: pearson(
        testItems.map((d) => composite(d.judge)),
        testItems.map((d) => d.judge.scores.testsWritten!),
      ),
    });
  }

  const copyCorrs: { tone: string; rWc: number; rCr: number }[] = [];
  for (const tone of TONES) {
    const items = copyData.filter((d) => d.judge.config.tone === tone);
    const wcItems = items.filter(
      (d) => d.judge.scores.totalWordCount != null,
    );
    const crItems = items.filter(
      (d) => d.judge.scores.completenessRate != null,
    );
    copyCorrs.push({
      tone,
      rWc: pearson(
        wcItems.map((d) => composite(d.judge)),
        wcItems.map((d) => d.judge.scores.totalWordCount!),
      ),
      rCr: pearson(
        crItems.map((d) => composite(d.judge)),
        crItems.map((d) => d.judge.scores.completenessRate!),
      ),
    });
  }

  const sortCorrs: { tone: string; rAcc: number }[] = [];
  for (const tone of TONES) {
    const items = sortData.filter((d) => d.judge.config.tone === tone);
    const accItems = items.filter(
      (d) => d.judge.scores.sortAccuracy != null,
    );
    sortCorrs.push({
      tone,
      rAcc: pearson(
        accItems.map((d) => composite(d.judge)),
        accItems.map((d) => d.judge.scores.sortAccuracy!),
      ),
    });
  }

  // Identify the most interesting patterns
  const bestCodingLocTone = codingCorrs.reduce((a, b) =>
    Math.abs(a.rLoc) > Math.abs(b.rLoc) ? a : b,
  );
  const bestCopyWcTone = copyCorrs.reduce((a, b) =>
    Math.abs(a.rWc) > Math.abs(b.rWc) ? a : b,
  );

  console.log(
    "The correlation between structural/automated metrics and qualitative judge scores varies substantially by tone:\n",
  );
  console.log(
    "**Coding (LOC vs judge composite):** " +
      codingCorrs
        .map((c) => `${c.tone}=${fmtRaw(c.rLoc)} (${corrLabel(c.rLoc)})`)
        .join(", ") +
      `. Strongest correlation at tone="${bestCodingLocTone.tone}".`,
  );
  console.log(
    "**Coding (testsWritten vs judge composite):** " +
      codingCorrs
        .map(
          (c) => `${c.tone}=${fmtRaw(c.rTests)} (${corrLabel(c.rTests)})`,
        )
        .join(", ") +
      ".",
  );
  console.log(
    "**Copywriting (wordCount vs judge composite):** " +
      copyCorrs
        .map((c) => `${c.tone}=${fmtRaw(c.rWc)} (${corrLabel(c.rWc)})`)
        .join(", ") +
      `. Strongest at tone="${bestCopyWcTone.tone}".`,
  );
  console.log(
    "**Copywriting (completenessRate vs judge composite):** " +
      copyCorrs
        .map((c) => `${c.tone}=${fmtRaw(c.rCr)} (${corrLabel(c.rCr)})`)
        .join(", ") +
      ". (All completenessRate values are 1.0 -- zero variance makes correlation undefined.)",
  );
  console.log(
    "**File-sorting (sortAccuracy vs judge composite):** " +
      sortCorrs
        .map((c) => `${c.tone}=${fmtRaw(c.rAcc)} (${corrLabel(c.rAcc)})`)
        .join(", ") +
      ".",
  );
  console.log(
    "\nKey takeaway: The relationship between 'how much was produced' and 'how good the judge thought it was' " +
      "is not constant across tones. Differences in correlation magnitude by tone suggest that tone conditions " +
      "alter not just output quantity but how well quantity tracks quality.\n",
  );

  // --------------- FINDING 6 ---------------
  console.log("### FINDING_6: Step Count and Tool Call Patterns\n");

  // Compute tone-level aggregates
  const toneStats: {
    tone: string;
    steps: number;
    calls: number;
    ratio: number;
  }[] = [];
  for (const tone of TONES) {
    const items = data.filter((d) => d.raw.config.tone === tone);
    const steps = items.map((d) => d.raw.totalSteps);
    const calls = items.map((d) => d.raw.totalToolCalls);
    const ratio = items.map((d) =>
      d.raw.totalSteps > 0 ? d.raw.totalToolCalls / d.raw.totalSteps : 0,
    );
    toneStats.push({
      tone,
      steps: mean(steps),
      calls: mean(calls),
      ratio: mean(ratio),
    });
  }

  const formalStats = toneStats.find((s) => s.tone === "formal")!;
  const casualStats = toneStats.find((s) => s.tone === "casual")!;
  const controlledStats = toneStats.find((s) => s.tone === "controlled")!;

  const stepsDelta =
    ((formalStats.steps - casualStats.steps) / casualStats.steps) * 100;
  const callsDelta =
    ((formalStats.calls - casualStats.calls) / casualStats.calls) * 100;

  console.log(
    `Across all models and tasks, formal prompts yield an average of ${fmtNum(formalStats.steps)} steps ` +
      `vs casual's ${fmtNum(casualStats.steps)} steps (${stepsDelta >= 0 ? "+" : ""}${fmtNum(stepsDelta)}%), ` +
      `and ${fmtNum(formalStats.calls)} tool calls vs casual's ${fmtNum(casualStats.calls)} ` +
      `(${callsDelta >= 0 ? "+" : ""}${fmtNum(callsDelta)}%). ` +
      `Controlled sits at ${fmtNum(controlledStats.steps)} steps / ${fmtNum(controlledStats.calls)} tool calls.`,
  );
  console.log(
    `\nThe tool-calls-per-step ratio is: casual=${fmtRaw(casualStats.ratio, 2)}, ` +
      `controlled=${fmtRaw(controlledStats.ratio, 2)}, formal=${fmtRaw(formalStats.ratio, 2)}. ` +
      (formalStats.ratio > casualStats.ratio
        ? "Formal prompts lead to slightly more tool use per step, suggesting more iterative refinement."
        : formalStats.ratio < casualStats.ratio
          ? "Casual prompts actually show higher tool use per step than formal."
          : "The ratio is roughly equal across tones."),
  );

  // Check by task
  console.log("\nBy task:");
  for (const task of TASKS) {
    const taskToneStats: string[] = [];
    for (const tone of TONES) {
      const items = data.filter(
        (d) => d.raw.config.task === task && d.raw.config.tone === tone,
      );
      if (items.length === 0) continue;
      const s = mean(items.map((d) => d.raw.totalSteps));
      const c = mean(items.map((d) => d.raw.totalToolCalls));
      const r = mean(
        items.map((d) =>
          d.raw.totalSteps > 0
            ? d.raw.totalToolCalls / d.raw.totalSteps
            : 0,
        ),
      );
      taskToneStats.push(
        `${tone}: ${fmtNum(s)} steps, ${fmtNum(c)} calls, ${fmtRaw(r, 2)} TC/step`,
      );
    }
    console.log(`  - ${task}: ${taskToneStats.join(" | ")}`);
  }

  // Check by model
  const models = [
    ...new Set(data.map((d) => d.raw.config.model.label)),
  ].sort();
  console.log("\nBy model (formal vs casual delta):");
  for (const model of models) {
    const formal = data.filter(
      (d) =>
        d.raw.config.model.label === model && d.raw.config.tone === "formal",
    );
    const casual = data.filter(
      (d) =>
        d.raw.config.model.label === model && d.raw.config.tone === "casual",
    );
    if (formal.length === 0 || casual.length === 0) continue;
    const fSteps = mean(formal.map((d) => d.raw.totalSteps));
    const cSteps = mean(casual.map((d) => d.raw.totalSteps));
    const fCalls = mean(formal.map((d) => d.raw.totalToolCalls));
    const cCalls = mean(casual.map((d) => d.raw.totalToolCalls));
    const delta = fSteps - cSteps;
    console.log(
      `  - ${model}: formal=${fmtNum(fSteps)} steps/${fmtNum(fCalls)} calls, ` +
        `casual=${fmtNum(cSteps)} steps/${fmtNum(cCalls)} calls ` +
        `(delta steps: ${delta >= 0 ? "+" : ""}${fmtNum(delta)})`,
    );
  }

  console.log(
    "\nKey takeaway: The effect of tone on process patterns (step/tool counts) varies by model and task. " +
      "The direction and magnitude of the formal-vs-casual difference in iterative behavior is not uniform, " +
      "indicating that tone's influence on process is model- and task-dependent rather than a universal pattern.\n",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const data = await loadAllData();
  console.log(`# Process Pattern Analysis\n`);
  console.log(`Loaded ${data.length} joined records (raw + judge)\n`);

  const models = [...new Set(data.map((d) => d.raw.config.model.label))].sort();
  const tones = [...new Set(data.map((d) => d.raw.config.tone))];
  const tasks = [...new Set(data.map((d) => d.raw.config.task))];
  console.log(`Models: ${models.join(", ")}`);
  console.log(`Tones: ${tones.join(", ")}`);
  console.log(`Tasks: ${tasks.join(", ")}`);
  console.log();

  analyzeCorrelationByTone(data);
  analyzeStepPatterns(data);
  printFindings(data);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
