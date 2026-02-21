import { randomUUID } from "node:crypto";
import { MODELS, TONES, TASKS, MAX_STEPS, type RuntimeModelConfig } from "../config.js";
import { runSingle } from "./run-single.js";
import { storeFailures, storeManifest, storeResult, storeSummary } from "../results/store.js";
import type {
  EvalBatchManifest,
  EvalRunConfig,
  EvalRunFailure,
  EvalRunResult,
  ToneStyle,
  TaskType,
} from "../types.js";

interface EvalOptions {
  models?: RuntimeModelConfig[];
  tones?: ToneStyle[];
  tasks?: TaskType[];
  trials?: number;
  /** Max concurrent runs per provider. Default: 1 for anthropic, 4 for openai */
  concurrencyPerProvider?: Partial<Record<string, number>>;
}

interface RunJob {
  config: EvalRunConfig;
  runtimeModel: RuntimeModelConfig;
  label: string;
}

export async function runFullEval(options: EvalOptions = {}): Promise<EvalRunResult[]> {
  const startedAt = new Date().toISOString();
  const models = options.models ?? MODELS;
  const tones = options.tones ?? TONES;
  const tasks = options.tasks ?? TASKS;
  const trials = options.trials ?? 1;
  const concurrencyLimits = {
    anthropic: 1,  // sequential to avoid rate limits
    openai: 4,     // can parallelize freely
    ...options.concurrencyPerProvider,
  };

  // Build all jobs
  const jobs: RunJob[] = [];
  for (const runtimeModel of models) {
    for (const tone of tones) {
      for (const task of tasks) {
        for (let trial = 1; trial <= trials; trial++) {
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
              trial,
              maxSteps: MAX_STEPS,
              runId: randomUUID(),
            },
            runtimeModel,
            label: `${runtimeModel.label} | ${tone} | ${task} | t${trial}`,
          });
        }
      }
    }
  }

  const total = jobs.length;
  let completed = 0;
  const results: EvalRunResult[] = [];
  const failures: EvalRunFailure[] = [];

  // Group jobs by provider for separate concurrency control
  const jobsByProvider = new Map<string, RunJob[]>();
  for (const job of jobs) {
    const provider = job.runtimeModel.provider;
    if (!jobsByProvider.has(provider)) jobsByProvider.set(provider, []);
    jobsByProvider.get(provider)!.push(job);
  }

  // Show replication context
  if (trials > 1) {
    console.log(`\nRunning ${trials} trials per config = ${total} total runs`);
    console.log(`Concurrency: ${[...Object.entries(concurrencyLimits)].map(([p, c]) => `${p}=${c}`).join(", ")}\n`);
  }

  // Run each provider's jobs with its own concurrency limit, all providers in parallel
  const providerPromises = [...jobsByProvider.entries()].map(
    async ([provider, providerJobs]) => {
      const concurrency = concurrencyLimits[provider as keyof typeof concurrencyLimits] ?? 1;
      const executing = new Set<Promise<void>>();

      for (const job of providerJobs) {
        const p = (async () => {
          console.log(`[${completed + executing.size + 1}/${total}] ${job.label} (starting)`);
          try {
            const result = await runSingle(job.config, job.runtimeModel.model);
            results.push(result);
            await storeResult(result);
            completed++;
            console.log(
              `[${completed}/${total}] ${job.label} -> ${result.totalSteps} steps, ${result.totalToolCalls} tools, ${result.totalTokens.toLocaleString()} tokens`
            );
          } catch (error) {
            completed++;
            failures.push({
              config: job.config,
              error: error instanceof Error ? error.message : String(error),
              occurredAt: new Date().toISOString(),
            });
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
    }
  );

  await Promise.all(providerPromises);

  // Write outputs
  await storeSummary(results);
  if (failures.length > 0) {
    await storeFailures(failures);
  }

  const manifest: EvalBatchManifest = {
    startedAt,
    completedAt: new Date().toISOString(),
    expectedRuns: total,
    successfulRuns: results.length,
    failedRuns: failures.length,
    models: models.map((m) => m.id),
    tones,
    tasks,
    trials,
    concurrencyPerProvider: concurrencyLimits,
  };
  await storeManifest(manifest);

  if (failures.length > 0) {
    throw new Error(`Batch completed with failures (${failures.length}/${total} failed).`);
  }

  return results;
}
