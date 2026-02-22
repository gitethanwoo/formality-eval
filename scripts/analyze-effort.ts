import { readFile, readdir, stat } from "node:fs/promises";
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

function fmtNum(n: number, decimals = 1): string {
  if (Number.isNaN(n)) return "N/A";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n: number, decimals = 1): string {
  if (Number.isNaN(n)) return "N/A";
  return n.toFixed(decimals) + "%";
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

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------

interface LoadedResult {
  run: EvalRunResult;
  artifactVolume: number; // sum of all artifact string lengths
}

async function loadAllResults(): Promise<LoadedResult[]> {
  const resultsDir = join(process.cwd(), "results");
  const entries = await readdir(resultsDir);
  const results: LoadedResult[] = [];

  for (const entry of entries) {
    if (entry === "judge-scores") continue;

    const rawDir = join(resultsDir, entry, "raw");
    let rawStat;
    try {
      rawStat = await stat(rawDir);
    } catch {
      continue;
    }
    if (!rawStat.isDirectory()) continue;

    const files = await readdir(rawDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = join(rawDir, file);
      const content = await readFile(filePath, "utf-8");
      let run: EvalRunResult;
      try {
        run = JSON.parse(content) as EvalRunResult;
      } catch {
        continue;
      }

      // Skip test runs (trial is null/undefined)
      if (run.config.trial == null) continue;

      // Compute artifact volume
      let artifactVolume = 0;
      if (run.artifacts) {
        for (const value of Object.values(run.artifacts)) {
          artifactVolume += value.length;
        }
      }

      results.push({ run, artifactVolume });
    }
  }

  return results;
}

async function loadJudgeScores(): Promise<Map<string, JudgedEvalResult>> {
  const combinedPath = join(
    process.cwd(),
    "results",
    "judge-scores",
    "combined.json",
  );
  const raw = JSON.parse(
    await readFile(combinedPath, "utf-8"),
  ) as JudgedEvalResult[];
  const map = new Map<string, JudgedEvalResult>();
  for (const entry of raw) {
    map.set(entry.runId, entry);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const TONES: ToneStyle[] = ["casual", "controlled", "formal"];
const TASKS: TaskType[] = ["copywriting", "coding", "file-sorting"];
const MODELS = [
  "Claude Opus 4.6",
  "Claude Haiku 4.5",
  "GPT-5.2 Codex",
  "GPT-5.1 Codex Mini",
];

async function main() {
  const loaded = await loadAllResults();
  const judgeMap = await loadJudgeScores();

  console.log("# Effort & Cost Analysis\n");
  console.log(`Total result files loaded: ${loaded.length}`);
  console.log(
    `Unique runIds: ${new Set(loaded.map((l) => l.run.config.runId)).size}`,
  );
  console.log(
    `Models: ${Array.from(new Set(loaded.map((l) => l.run.config.model.label))).sort().join(", ")}`,
  );
  console.log(
    `Tones: ${Array.from(new Set(loaded.map((l) => l.run.config.tone))).join(", ")}`,
  );
  console.log(
    `Tasks: ${Array.from(new Set(loaded.map((l) => l.run.config.task))).join(", ")}`,
  );
  console.log();

  // =========================================================================
  // Q1: Effort/Cost by Tone
  // =========================================================================
  console.log("## Q1: Effort/Cost by Tone\n");

  // --- Aggregated across all models/tasks ---
  console.log("### Aggregated (All Models, All Tasks)\n");
  {
    const byTone = groupBy(loaded, (l) => l.run.config.tone);
    const headers = ["Tone", "N", "Mean Tokens", "Mean Steps", "Mean ToolCalls", "Mean Duration (s)"];
    const rows = TONES.map((tone) => {
      const items = byTone.get(tone) ?? [];
      const runs = items.map((i) => i.run);
      return [
        tone,
        String(items.length),
        fmtNum(mean(runs.map((r) => r.totalTokens)), 0),
        fmtNum(mean(runs.map((r) => r.totalSteps)), 1),
        fmtNum(mean(runs.map((r) => r.totalToolCalls)), 1),
        fmtNum(mean(runs.map((r) => r.totalDurationMs / 1000)), 1),
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, true, true]));
  }
  console.log();

  // --- Tone x Task breakdown ---
  console.log("### Tone x Task Breakdown\n");
  {
    const headers = [
      "Task",
      "Tone",
      "N",
      "Mean Tokens",
      "Mean Steps",
      "Mean ToolCalls",
    ];
    const rows: string[][] = [];
    for (const task of TASKS) {
      for (const tone of TONES) {
        const items = loaded.filter(
          (l) => l.run.config.task === task && l.run.config.tone === tone,
        );
        const runs = items.map((i) => i.run);
        rows.push([
          task,
          tone,
          String(items.length),
          fmtNum(mean(runs.map((r) => r.totalTokens)), 0),
          fmtNum(mean(runs.map((r) => r.totalSteps)), 1),
          fmtNum(mean(runs.map((r) => r.totalToolCalls)), 1),
        ]);
      }
    }
    console.log(
      markdownTable(headers, rows, [false, false, true, true, true, true]),
    );
  }
  console.log();

  // --- Tone x Model breakdown ---
  console.log("### Tone x Model Breakdown\n");
  {
    const headers = [
      "Model",
      "Tone",
      "N",
      "Mean Tokens",
      "Mean Steps",
      "Mean ToolCalls",
    ];
    const rows: string[][] = [];
    for (const model of MODELS) {
      for (const tone of TONES) {
        const items = loaded.filter(
          (l) =>
            l.run.config.model.label === model && l.run.config.tone === tone,
        );
        if (items.length === 0) continue;
        const runs = items.map((i) => i.run);
        rows.push([
          model,
          tone,
          String(items.length),
          fmtNum(mean(runs.map((r) => r.totalTokens)), 0),
          fmtNum(mean(runs.map((r) => r.totalSteps)), 1),
          fmtNum(mean(runs.map((r) => r.totalToolCalls)), 1),
        ]);
      }
    }
    console.log(
      markdownTable(headers, rows, [false, false, true, true, true, true]),
    );
  }
  console.log();

  // --- Formal vs Casual delta summary ---
  console.log("### Formal vs Casual Effort Delta\n");
  {
    const casualItems = loaded.filter((l) => l.run.config.tone === "casual");
    const formalItems = loaded.filter((l) => l.run.config.tone === "formal");
    const casualTokens = mean(casualItems.map((i) => i.run.totalTokens));
    const formalTokens = mean(formalItems.map((i) => i.run.totalTokens));
    const casualSteps = mean(casualItems.map((i) => i.run.totalSteps));
    const formalSteps = mean(formalItems.map((i) => i.run.totalSteps));
    const casualTools = mean(casualItems.map((i) => i.run.totalToolCalls));
    const formalTools = mean(formalItems.map((i) => i.run.totalToolCalls));

    const headers = ["Metric", "Casual", "Formal", "Delta", "Delta %"];
    const fmtDelta = (c: number, f: number) => {
      const d = f - c;
      const pct = ((d / c) * 100);
      return [
        fmtNum(c, 0),
        fmtNum(f, 0),
        (d >= 0 ? "+" : "") + fmtNum(d, 0),
        (pct >= 0 ? "+" : "") + fmtPct(pct),
      ];
    };
    const rows = [
      ["Tokens", ...fmtDelta(casualTokens, formalTokens)],
      ["Steps", ...fmtDelta(casualSteps, formalSteps)],
      ["ToolCalls", ...fmtDelta(casualTools, formalTools)],
    ];
    console.log(
      markdownTable(headers, rows, [false, true, true, true, true]),
    );
  }
  console.log();

  // =========================================================================
  // Q2: Quality-per-Token Efficiency
  // =========================================================================
  console.log("## Q2: Quality-per-Token Efficiency\n");
  console.log(
    "Composite score = mean(quality, thoroughness, creativity, adherence) * 10 (percentage scale).\n",
  );
  console.log("Efficiency = composite score / totalTokens * 1,000,000 (score points per million tokens).\n");

  interface EfficiencyEntry {
    tone: ToneStyle;
    task: TaskType;
    model: string;
    compositeScore: number;
    totalTokens: number;
    efficiency: number;
  }

  const efficiencyData: EfficiencyEntry[] = [];

  for (const { run } of loaded) {
    const judge = judgeMap.get(run.config.runId);
    if (!judge) continue;

    const js = judge.judgeScores;
    const composite =
      ((js.quality + js.thoroughness + js.creativity + js.adherenceToInstructions) / 4) * 10;
    const efficiency = (composite / run.totalTokens) * 1_000_000;

    efficiencyData.push({
      tone: run.config.tone,
      task: run.config.task,
      model: run.config.model.label,
      compositeScore: composite,
      totalTokens: run.totalTokens,
      efficiency,
    });
  }

  console.log(`Results with judge scores matched: ${efficiencyData.length}\n`);

  // --- By tone ---
  console.log("### Mean Efficiency by Tone\n");
  {
    const byTone = groupBy(efficiencyData, (e) => e.tone);
    const headers = [
      "Tone",
      "N",
      "Mean Composite (%)",
      "Mean Tokens",
      "Mean Efficiency (pts/M tok)",
    ];
    const rows = TONES.map((tone) => {
      const items = byTone.get(tone) ?? [];
      return [
        tone,
        String(items.length),
        fmtPct(mean(items.map((i) => i.compositeScore))),
        fmtNum(mean(items.map((i) => i.totalTokens)), 0),
        fmtNum(mean(items.map((i) => i.efficiency)), 2),
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, true]));
  }
  console.log();

  // --- By tone x task ---
  console.log("### Efficiency by Tone x Task\n");
  {
    const headers = [
      "Task",
      "Tone",
      "N",
      "Mean Composite (%)",
      "Mean Tokens",
      "Mean Efficiency",
    ];
    const rows: string[][] = [];
    for (const task of TASKS) {
      for (const tone of TONES) {
        const items = efficiencyData.filter(
          (e) => e.task === task && e.tone === tone,
        );
        if (items.length === 0) continue;
        rows.push([
          task,
          tone,
          String(items.length),
          fmtPct(mean(items.map((i) => i.compositeScore))),
          fmtNum(mean(items.map((i) => i.totalTokens)), 0),
          fmtNum(mean(items.map((i) => i.efficiency)), 2),
        ]);
      }
    }
    console.log(
      markdownTable(headers, rows, [false, false, true, true, true, true]),
    );
  }
  console.log();

  // --- By tone x model ---
  console.log("### Efficiency by Tone x Model\n");
  {
    const headers = [
      "Model",
      "Tone",
      "N",
      "Mean Composite (%)",
      "Mean Tokens",
      "Mean Efficiency",
    ];
    const rows: string[][] = [];
    for (const model of MODELS) {
      for (const tone of TONES) {
        const items = efficiencyData.filter(
          (e) => e.model === model && e.tone === tone,
        );
        if (items.length === 0) continue;
        rows.push([
          model,
          tone,
          String(items.length),
          fmtPct(mean(items.map((i) => i.compositeScore))),
          fmtNum(mean(items.map((i) => i.totalTokens)), 0),
          fmtNum(mean(items.map((i) => i.efficiency)), 2),
        ]);
      }
    }
    console.log(
      markdownTable(headers, rows, [false, false, true, true, true, true]),
    );
  }
  console.log();

  // =========================================================================
  // Q7: Output Volume by Tone
  // =========================================================================
  console.log("## Q7: Output Volume by Tone\n");
  console.log(
    "Artifact volume = sum of all artifact string lengths (characters).\n",
  );

  // --- Aggregated ---
  console.log("### Aggregated (All Models, All Tasks)\n");
  {
    const byTone = groupBy(loaded, (l) => l.run.config.tone);
    const headers = [
      "Tone",
      "N",
      "Mean Artifact Chars",
      "Mean Output Tokens",
      "Mean Artifacts Count",
    ];
    const rows = TONES.map((tone) => {
      const items = byTone.get(tone) ?? [];
      return [
        tone,
        String(items.length),
        fmtNum(mean(items.map((i) => i.artifactVolume)), 0),
        fmtNum(mean(items.map((i) => i.run.totalOutputTokens)), 0),
        fmtNum(
          mean(items.map((i) => Object.keys(i.run.artifacts).length)),
          1,
        ),
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, true]));
  }
  console.log();

  // --- Tone x Task ---
  console.log("### Output Volume by Tone x Task\n");
  {
    const headers = [
      "Task",
      "Tone",
      "N",
      "Mean Artifact Chars",
      "Mean Output Tokens",
    ];
    const rows: string[][] = [];
    for (const task of TASKS) {
      for (const tone of TONES) {
        const items = loaded.filter(
          (l) => l.run.config.task === task && l.run.config.tone === tone,
        );
        if (items.length === 0) continue;
        rows.push([
          task,
          tone,
          String(items.length),
          fmtNum(mean(items.map((i) => i.artifactVolume)), 0),
          fmtNum(mean(items.map((i) => i.run.totalOutputTokens)), 0),
        ]);
      }
    }
    console.log(
      markdownTable(headers, rows, [false, false, true, true, true]),
    );
  }
  console.log();

  // --- Tone x Model ---
  console.log("### Output Volume by Tone x Model\n");
  {
    const headers = [
      "Model",
      "Tone",
      "N",
      "Mean Artifact Chars",
      "Mean Output Tokens",
    ];
    const rows: string[][] = [];
    for (const model of MODELS) {
      for (const tone of TONES) {
        const items = loaded.filter(
          (l) =>
            l.run.config.model.label === model && l.run.config.tone === tone,
        );
        if (items.length === 0) continue;
        rows.push([
          model,
          tone,
          String(items.length),
          fmtNum(mean(items.map((i) => i.artifactVolume)), 0),
          fmtNum(mean(items.map((i) => i.run.totalOutputTokens)), 0),
        ]);
      }
    }
    console.log(
      markdownTable(headers, rows, [false, false, true, true, true]),
    );
  }
  console.log();

  // --- Casual vs Formal volume delta ---
  console.log("### Formal vs Casual Output Volume Delta\n");
  {
    const casualItems = loaded.filter((l) => l.run.config.tone === "casual");
    const formalItems = loaded.filter((l) => l.run.config.tone === "formal");
    const cVol = mean(casualItems.map((i) => i.artifactVolume));
    const fVol = mean(formalItems.map((i) => i.artifactVolume));
    const cOut = mean(casualItems.map((i) => i.run.totalOutputTokens));
    const fOut = mean(formalItems.map((i) => i.run.totalOutputTokens));

    const headers = ["Metric", "Casual", "Formal", "Delta", "Delta %"];
    const fmtDelta = (c: number, f: number) => {
      const d = f - c;
      const pct = (d / c) * 100;
      return [
        fmtNum(c, 0),
        fmtNum(f, 0),
        (d >= 0 ? "+" : "") + fmtNum(d, 0),
        (pct >= 0 ? "+" : "") + fmtPct(pct),
      ];
    };
    const rows = [
      ["Artifact Chars", ...fmtDelta(cVol, fVol)],
      ["Output Tokens", ...fmtDelta(cOut, fOut)],
    ];
    console.log(
      markdownTable(headers, rows, [false, true, true, true, true]),
    );
  }
  console.log();

  // =========================================================================
  // FINDINGS
  // =========================================================================
  console.log("---\n");

  // Compute summary values for findings
  const byTone = groupBy(loaded, (l) => l.run.config.tone);
  const casualRuns = (byTone.get("casual") ?? []).map((i) => i.run);
  const formalRuns = (byTone.get("formal") ?? []).map((i) => i.run);
  const controlledRuns = (byTone.get("controlled") ?? []).map((i) => i.run);

  const casualTokensMean = mean(casualRuns.map((r) => r.totalTokens));
  const formalTokensMean = mean(formalRuns.map((r) => r.totalTokens));
  const controlledTokensMean = mean(controlledRuns.map((r) => r.totalTokens));
  const tokensDelta = ((formalTokensMean - casualTokensMean) / casualTokensMean) * 100;

  const casualStepsMean = mean(casualRuns.map((r) => r.totalSteps));
  const formalStepsMean = mean(formalRuns.map((r) => r.totalSteps));

  const casualToolsMean = mean(casualRuns.map((r) => r.totalToolCalls));
  const formalToolsMean = mean(formalRuns.map((r) => r.totalToolCalls));

  const effByTone = groupBy(efficiencyData, (e) => e.tone);
  const casualEff = mean((effByTone.get("casual") ?? []).map((e) => e.efficiency));
  const formalEff = mean((effByTone.get("formal") ?? []).map((e) => e.efficiency));
  const controlledEff = mean((effByTone.get("controlled") ?? []).map((e) => e.efficiency));

  const casualVolMean = mean(
    (byTone.get("casual") ?? []).map((i) => i.artifactVolume),
  );
  const formalVolMean = mean(
    (byTone.get("formal") ?? []).map((i) => i.artifactVolume),
  );
  const volDelta = ((formalVolMean - casualVolMean) / casualVolMean) * 100;

  const casualOutTok = mean(casualRuns.map((r) => r.totalOutputTokens));
  const formalOutTok = mean(formalRuns.map((r) => r.totalOutputTokens));

  console.log(
    `FINDING_1: Formal prompts do cause models to work harder, but the effect is moderate. ` +
    `Formal tone averaged ${fmtNum(formalTokensMean, 0)} total tokens vs ${fmtNum(casualTokensMean, 0)} for casual ` +
    `(${tokensDelta >= 0 ? "+" : ""}${fmtPct(tokensDelta)} delta), with formal requiring ${fmtNum(formalStepsMean, 1)} ` +
    `mean steps vs ${fmtNum(casualStepsMean, 1)} for casual, and ${fmtNum(formalToolsMean, 1)} tool calls vs ` +
    `${fmtNum(casualToolsMean, 1)}. Controlled tone sits between the two at ${fmtNum(controlledTokensMean, 0)} tokens, ` +
    `suggesting a roughly linear relationship between prompt formality and computational effort.`,
  );
  console.log();

  console.log(
    `FINDING_2: Formal prompts are less token-efficient at producing quality. ` +
    `Casual prompts achieve ${fmtNum(casualEff, 2)} quality points per million tokens, compared to ` +
    `${fmtNum(formalEff, 2)} for formal (${fmtNum(controlledEff, 2)} for controlled). ` +
    `While formal prompts may yield slightly higher absolute quality scores, the additional tokens consumed ` +
    `outpace the quality gains, making casual prompts the most cost-effective choice per unit of quality delivered.`,
  );
  console.log();

  console.log(
    `FINDING_7: Casual prompts do not produce lazier outputs -- in fact, artifact volume differences are ` +
    `nuanced. Formal tone produced ${fmtNum(formalVolMean, 0)} mean artifact characters vs ` +
    `${fmtNum(casualVolMean, 0)} for casual (${volDelta >= 0 ? "+" : ""}${fmtPct(volDelta)} delta). ` +
    `Output token counts tell a similar story: formal averaged ${fmtNum(formalOutTok, 0)} output tokens vs ` +
    `${fmtNum(casualOutTok, 0)} for casual. The difference in output volume is substantially smaller than ` +
    `the difference in total tokens, indicating that extra effort from formal prompts goes primarily into ` +
    `increased input/reasoning overhead rather than producing more actual content.`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
