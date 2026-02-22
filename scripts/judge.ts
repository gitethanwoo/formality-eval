import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import type {
  EvalRunResult,
  TaskType,
  AutomatedScores,
  JudgedEvalResult,
} from "../src/types.js";
import { judgeSingle, JUDGE_MODEL_ID } from "../src/scoring/llm-judge.js";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let concurrency = 5;
  let dry = false;
  let taskFilter: TaskType | undefined;
  let modelFilter: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--concurrency":
        concurrency = parseInt(args[++i], 10);
        break;
      case "--dry":
        dry = true;
        break;
      case "--task":
        taskFilter = args[++i] as TaskType;
        break;
      case "--model":
        modelFilter = args[++i];
        break;
    }
  }
  return { concurrency, dry, taskFilter, modelFilter };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Normalize scores from old format (nested {automated, laziness}) to flat AutomatedScores.
 */
function normalizeScores(raw: Record<string, unknown>): AutomatedScores {
  if ("automated" in raw && typeof raw.automated === "object" && raw.automated !== null) {
    return raw.automated as AutomatedScores;
  }
  return raw as AutomatedScores;
}

async function discoverResults(
  resultsDirs: string[]
): Promise<Map<string, { path: string; result: EvalRunResult }>> {
  const byRunId = new Map<
    string,
    { path: string; result: EvalRunResult }
  >();

  for (const dir of resultsDirs) {
    const rawDir = join(dir, "raw");
    if (!existsSync(rawDir)) continue;
    const files = await readdir(rawDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const fullPath = join(rawDir, file);
      const data = JSON.parse(await readFile(fullPath, "utf-8")) as EvalRunResult;
      // Skip test runs that lack a trial number
      if (data.config.trial == null) continue;
      // Normalize old nested scores format to flat AutomatedScores
      data.scores = normalizeScores(data.scores as unknown as Record<string, unknown>);
      // Deduplicate: later directories win (more recent run)
      byRunId.set(data.config.runId, { path: fullPath, result: data });
    }
  }

  return byRunId;
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { concurrency, dry, taskFilter, modelFilter } = parseArgs();

  // Find all result directories
  const resultsRoot = join(process.cwd(), "results");
  const allDirs = (await readdir(resultsRoot))
    .filter((d) => d !== "judge-scores")
    .sort()
    .map((d) => join(resultsRoot, d));

  console.log(`Scanning ${allDirs.length} result directories...`);
  const allResults = await discoverResults(allDirs);
  console.log(`Found ${allResults.size} unique results (by runId)`);

  // Apply filters
  let entries = [...allResults.entries()];
  if (taskFilter) {
    entries = entries.filter(([, v]) => v.result.config.task === taskFilter);
    console.log(`Filtered to task=${taskFilter}: ${entries.length} results`);
  }
  if (modelFilter) {
    entries = entries.filter(([, v]) =>
      v.result.config.model.label.toLowerCase().includes(modelFilter!.toLowerCase())
    );
    console.log(`Filtered to model=${modelFilter}: ${entries.length} results`);
  }

  // Output dirs
  const outputRoot = join(resultsRoot, "judge-scores");
  const rawOutputDir = join(outputRoot, "raw");
  await mkdir(rawOutputDir, { recursive: true });

  // Check which are already judged (resume support)
  const alreadyJudged = new Set<string>();
  if (existsSync(rawOutputDir)) {
    const existing = await readdir(rawOutputDir);
    for (const f of existing) {
      if (f.endsWith(".json")) {
        alreadyJudged.add(f.replace(".json", ""));
      }
    }
  }

  const toJudge = entries.filter(([runId]) => !alreadyJudged.has(runId));
  console.log(
    `Already judged: ${alreadyJudged.size}, remaining: ${toJudge.length}`
  );

  if (dry) {
    console.log("\n--- DRY RUN ---");
    for (const [runId, { result }] of toJudge) {
      const c = result.config;
      console.log(
        `  ${c.model.label} | ${c.tone} | ${c.task} | t${c.trial} | ${runId}`
      );
    }
    console.log(`\nTotal: ${toJudge.length} to judge`);
    return;
  }

  if (toJudge.length === 0) {
    console.log("Nothing to judge. Generating combined output...");
  } else {
    console.log(
      `\nJudging ${toJudge.length} results with concurrency=${concurrency}...\n`
    );

    await mapWithConcurrency(toJudge, concurrency, async ([runId, { path, result }], i) => {
      const c = result.config;
      const label = `[${i + 1}/${toJudge.length}] ${c.model.label} | ${c.tone} | ${c.task} | t${c.trial}`;
      console.log(`${label} — judging...`);

      const scores = await judgeSingle(c.task, result.artifacts);

      const judgedResult: JudgedEvalResult = {
        runId,
        sourceFile: basename(path),
        config: c,
        scores: result.scores,
        judgeScores: scores,
        judgeModel: JUDGE_MODEL_ID,
        judgedAt: new Date().toISOString(),
      };

      // Write immediately for resume support
      await writeFile(
        join(rawOutputDir, `${runId}.json`),
        JSON.stringify(judgedResult, null, 2)
      );

      console.log(
        `${label} — done (q=${scores.quality} t=${scores.thoroughness} c=${scores.creativity} a=${scores.adherenceToInstructions})`
      );

      return judgedResult;
    });
  }

  // Build combined output from all raw judge files
  console.log("\nBuilding combined output...");
  const rawFiles = (await readdir(rawOutputDir)).filter((f) =>
    f.endsWith(".json")
  );
  const allJudged: JudgedEvalResult[] = [];
  for (const f of rawFiles) {
    const data = JSON.parse(
      await readFile(join(rawOutputDir, f), "utf-8")
    ) as JudgedEvalResult;
    allJudged.push(data);
  }

  // Sort for consistent output
  allJudged.sort((a, b) => {
    const cmp =
      a.config.model.label.localeCompare(b.config.model.label) ||
      a.config.tone.localeCompare(b.config.tone) ||
      a.config.task.localeCompare(b.config.task) ||
      a.config.trial - b.config.trial;
    return cmp;
  });

  // Write combined.json
  await writeFile(
    join(outputRoot, "combined.json"),
    JSON.stringify(allJudged, null, 2)
  );
  console.log(`Wrote combined.json (${allJudged.length} results)`);

  // Write summary.csv
  function csvEscape(value: string | number | undefined): string {
    const s = String(value ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""').replace(/\n/g, " ")}"`;
    }
    return s;
  }

  const csvHeader = [
    "runId",
    "model",
    "tier",
    "tone",
    "task",
    "trial",
    // Judge scores
    "judge_quality",
    "judge_thoroughness",
    "judge_creativity",
    "judge_adherence",
    // Automated scores (coding)
    "testsWritten",
    "testsPassing",
    "testPassRate",
    "linesOfCode",
    "edgeCasesCovered",
    // Automated scores (copywriting)
    "deliverablesProduced",
    "completenessRate",
    "totalWordCount",
    "requirementComplianceRate",
    // Automated scores (file-sorting)
    "totalFiles",
    "correctlyPlaced",
    "sortAccuracy",
    "filesUntouched",
    // Meta
    "justification",
  ].join(",");

  const csvRows = allJudged.map((r) => {
    const s = r.scores;
    const j = r.judgeScores;
    return [
      r.runId,
      csvEscape(r.config.model.label),
      r.config.model.tier,
      r.config.tone,
      r.config.task,
      r.config.trial,
      j.quality,
      j.thoroughness,
      j.creativity,
      j.adherenceToInstructions,
      s.testsWritten ?? "",
      s.testsPassing ?? "",
      s.testPassRate ?? "",
      s.linesOfCode ?? "",
      s.edgeCasesCovered ?? "",
      s.deliverablesProduced ?? "",
      s.completenessRate ?? "",
      s.totalWordCount ?? "",
      s.requirementComplianceRate ?? "",
      s.totalFiles ?? "",
      s.correctlyPlaced ?? "",
      s.sortAccuracy ?? "",
      s.filesUntouched ?? "",
      csvEscape(j.justification),
    ].join(",");
  });

  await writeFile(
    join(outputRoot, "summary.csv"),
    [csvHeader, ...csvRows].join("\n")
  );
  console.log(`Wrote summary.csv (${csvRows.length} rows)`);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
