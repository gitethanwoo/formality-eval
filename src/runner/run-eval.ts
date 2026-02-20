import { randomUUID } from "node:crypto";
import { MODELS, TONES, TASKS, MAX_STEPS, type RuntimeModelConfig } from "../config.js";
import { runSingle } from "./run-single.js";
import { storeResult, storeSummary } from "../results/store.js";
import { generateReport } from "../results/report.js";
import type { EvalRunConfig, EvalRunResult, ToneStyle, TaskType } from "../types.js";

interface EvalOptions {
  models?: RuntimeModelConfig[];
  tones?: ToneStyle[];
  tasks?: TaskType[];
  /** Max concurrent runs. Default: 4 */
  concurrency?: number;
}

interface RunJob {
  config: EvalRunConfig;
  runtimeModel: RuntimeModelConfig;
  label: string;
}

export async function runFullEval(options: EvalOptions = {}): Promise<EvalRunResult[]> {
  const models = options.models ?? MODELS;
  const tones = options.tones ?? TONES;
  const tasks = options.tasks ?? TASKS;
  const concurrency = options.concurrency ?? 4;

  // Build all jobs
  const jobs: RunJob[] = [];
  for (const runtimeModel of models) {
    for (const tone of tones) {
      for (const task of tasks) {
        jobs.push({
          config: {
            model: {
              id: runtimeModel.id,
              provider: runtimeModel.provider,
              label: runtimeModel.label,
              tier: runtimeModel.tier,
            },
            tone,
            task,
            maxSteps: MAX_STEPS,
            runId: randomUUID(),
          },
          runtimeModel,
          label: `${runtimeModel.label} | ${tone} | ${task}`,
        });
      }
    }
  }

  const total = jobs.length;
  let completed = 0;
  const results: EvalRunResult[] = [];

  // Process jobs with concurrency limit
  const executing = new Set<Promise<void>>();

  for (const job of jobs) {
    const p = (async () => {
      const idx = completed + executing.size + 1;
      console.log(`[${idx}/${total}] ${job.label} (starting)`);
      try {
        const result = await runSingle(job.config, job.runtimeModel.model);
        results.push(result);
        await storeResult(result);
        completed++;
        console.log(
          `[${completed}/${total}] ${job.label} -> ${result.totalSteps} steps, ${result.totalToolCalls} tool calls, laziness: ${result.scores.laziness.lazinessIndex.toFixed(3)}`
        );
      } catch (error) {
        completed++;
        console.error(
          `[${completed}/${total}] ${job.label} -> FAILED: ${error instanceof Error ? error.message : error}`
        );
      }
    })();

    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);

  // Generate summary
  await storeSummary(results);
  generateReport(results);

  return results;
}
