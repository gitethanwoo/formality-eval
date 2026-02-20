import { parseArgs } from "node:util";
import { MODELS, TONES, TASKS, type RuntimeModelConfig } from "./config.js";
import { runFullEval } from "./runner/run-eval.js";
import type { ToneStyle, TaskType } from "./types.js";

const { values } = parseArgs({
  options: {
    model: { type: "string", short: "m" },
    tone: { type: "string", short: "t" },
    task: { type: "string", short: "k" },
    all: { type: "boolean", short: "a" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help) {
  console.log(`
formality-eval — Does prompt formality affect AI laziness?

Usage:
  tsx src/index.ts [options]

Options:
  --all, -a              Run the full eval matrix (all models x tones x tasks)
  --model, -m <id>       Filter to a specific model (e.g., "anthropic/claude-haiku-4-5")
  --tone, -t <tone>      Filter to "casual" or "formal"
  --task, -k <task>      Filter to "copywriting", "coding", or "file-sorting"
  --help, -h             Show this help

Examples:
  tsx src/index.ts --all
  tsx src/index.ts --model anthropic/claude-haiku-4-5 --tone casual --task coding
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
    console.error(
      `Unknown tone: ${values.tone}\nAvailable: ${TONES.join(", ")}`
    );
    process.exit(1);
  }
  tones = [values.tone as ToneStyle];
}

let tasks: TaskType[] | undefined;
if (values.task) {
  if (!TASKS.includes(values.task as TaskType)) {
    console.error(
      `Unknown task: ${values.task}\nAvailable: ${TASKS.join(", ")}`
    );
    process.exit(1);
  }
  tasks = [values.task as TaskType];
}

if (!values.all && !values.model && !values.tone && !values.task) {
  console.error("Specify --all for the full matrix, or use filters. See --help.");
  process.exit(1);
}

const filterModels = models ?? MODELS;
const filterTones = tones ?? TONES;
const filterTasks = tasks ?? TASKS;
const totalRuns = filterModels.length * filterTones.length * filterTasks.length;

console.log(`\nFormality Eval`);
console.log(`Models: ${filterModels.map((m) => m.label).join(", ")}`);
console.log(`Tones: ${filterTones.join(", ")}`);
console.log(`Tasks: ${filterTasks.join(", ")}`);
console.log(`Total runs: ${totalRuns}\n`);

const results = await runFullEval({
  models: filterModels,
  tones: filterTones,
  tasks: filterTasks,
});

console.log(`\nCompleted ${results.length}/${totalRuns} runs successfully.`);
