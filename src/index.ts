import { parseArgs } from "node:util";
import { MODELS, TONES, TASKS, type RuntimeModelConfig } from "./config.js";
import { runFullEval } from "./runner/run-eval.js";
import type { ToneStyle, TaskType } from "./types.js";

const { values } = parseArgs({
  options: {
    model: { type: "string", short: "m" },
    tone: { type: "string", short: "t" },
    task: { type: "string", short: "k" },
    trials: { type: "string", short: "n" },
    all: { type: "boolean", short: "a" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help) {
  console.log(`
formality-eval — Does prompt formality affect AI effort?

Usage:
  tsx src/index.ts [options]

Options:
  --all, -a              Run the full eval matrix
  --model, -m <id>       Filter to a specific model
  --tone, -t <tone>      Filter to "casual", "controlled", or "formal"
  --task, -k <task>      Filter to "copywriting", "coding", or "file-sorting"
  --trials, -n <count>   Number of trials per config (default: 1)
  --help, -h             Show this help

Examples:
  tsx src/index.ts --all --trials 3
  tsx src/index.ts --model claude-haiku-4-5 --task copywriting --trials 3
  tsx src/index.ts --tone formal
`);
  process.exit(0);
}

// Build filters
let models: RuntimeModelConfig[] | undefined;
if (values.model) {
  const found = MODELS.find((m) => m.id === values.model);
  if (!found) {
    console.error(
      `Unknown model: ${values.model}\nAvailable: ${MODELS.map((m) => m.id).join(", ")}`
    );
    process.exit(1);
  }
  models = [found];
}

let tones: ToneStyle[] | undefined;
if (values.tone) {
  if (!TONES.includes(values.tone as ToneStyle)) {
    console.error(`Unknown tone: ${values.tone}\nAvailable: ${TONES.join(", ")}`);
    process.exit(1);
  }
  tones = [values.tone as ToneStyle];
}

let tasks: TaskType[] | undefined;
if (values.task) {
  if (!TASKS.includes(values.task as TaskType)) {
    console.error(`Unknown task: ${values.task}\nAvailable: ${TASKS.join(", ")}`);
    process.exit(1);
  }
  tasks = [values.task as TaskType];
}

const trials = values.trials ? parseInt(values.trials, 10) : 1;

if (!values.all && !values.model && !values.tone && !values.task) {
  console.error("Specify --all for the full matrix, or use filters. See --help.");
  process.exit(1);
}

const filterModels = models ?? MODELS;
const filterTones = tones ?? TONES;
const filterTasks = tasks ?? TASKS;
const totalRuns = filterModels.length * filterTones.length * filterTasks.length * trials;

console.log(`\nFormality Eval`);
console.log(`Models: ${filterModels.map((m) => m.label).join(", ")}`);
console.log(`Tones: ${filterTones.join(", ")}`);
console.log(`Tasks: ${filterTasks.join(", ")}`);
console.log(`Trials: ${trials}`);
console.log(`Total runs: ${totalRuns}\n`);

const results = await runFullEval({
  models: filterModels,
  tones: filterTones,
  tasks: filterTasks,
  trials,
});

console.log(`\nCompleted ${results.length}/${totalRuns} runs successfully.`);
