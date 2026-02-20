import type { TaskType, AutomatedScores } from "../types.js";
import type { EvalSandbox } from "../sandbox/create.js";
import { scoreCoding } from "./coding.js";
import { scoreCopywriting } from "./copywriting.js";
import { scoreFileSorting } from "./file-sorting.js";

export async function scoreByTaskType(
  task: TaskType,
  sandbox: EvalSandbox
): Promise<AutomatedScores> {
  switch (task) {
    case "coding":
      return scoreCoding(sandbox);
    case "copywriting":
      return scoreCopywriting(sandbox);
    case "file-sorting":
      return scoreFileSorting(sandbox);
  }
}
