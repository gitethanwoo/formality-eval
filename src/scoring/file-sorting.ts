import type { EvalSandbox } from "../sandbox/create.js";
import type { AutomatedScores } from "../types.js";

export async function scoreFileSorting(
  sandbox: EvalSandbox
): Promise<AutomatedScores> {
  const allFiles = await sandbox.listFiles();

  // Count files that are in subdirectories (i.e., were moved from root)
  const filesInSubdirs = allFiles.filter((f) => f.includes("/"));
  const filesInRoot = allFiles.filter(
    (f) => !f.includes("/") && f !== "MANIFEST.md"
  );

  // Total seed files (excluding any generated files like MANIFEST.md)
  const totalFiles = allFiles.filter((f) => f !== "MANIFEST.md").length;
  const correctlyPlaced = filesInSubdirs.length;
  const filesUntouched = filesInRoot.length;

  return {
    totalFiles,
    correctlyPlaced,
    sortAccuracy: totalFiles > 0 ? correctlyPlaced / totalFiles : 0,
    filesUntouched,
  };
}
