import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalRunResult } from "../types.js";

function getResultsDir(): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return join(process.cwd(), "results", now);
}

let currentResultsDir: string | null = null;

async function ensureResultsDir(): Promise<string> {
  if (!currentResultsDir) {
    currentResultsDir = getResultsDir();
  }
  await mkdir(join(currentResultsDir, "raw"), { recursive: true });
  return currentResultsDir;
}

export async function storeResult(result: EvalRunResult): Promise<void> {
  const dir = await ensureResultsDir();
  const modelSlug = result.config.model.label.replace(/\s+/g, "-");
  const filename = `${modelSlug}_${result.config.tone}_${result.config.task}_t${result.config.trial}.json`;
  await writeFile(
    join(dir, "raw", filename),
    JSON.stringify(result, null, 2),
    "utf-8"
  );
}

export async function storeSummary(results: EvalRunResult[]): Promise<void> {
  const dir = await ensureResultsDir();
  const summary = results.map((r) => ({
    model: r.config.model.label,
    provider: r.config.model.provider,
    tier: r.config.model.tier,
    tone: r.config.tone,
    task: r.config.task,
    trial: r.config.trial,
    totalSteps: r.totalSteps,
    totalToolCalls: r.totalToolCalls,
    totalTokens: r.totalTokens,
    totalDurationMs: r.totalDurationMs,
    scores: r.scores,
  }));
  await writeFile(
    join(dir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf-8"
  );
}
