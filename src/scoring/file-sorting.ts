import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { EvalSandbox } from "../sandbox/create.js";
import type { AutomatedScores } from "../types.js";

export async function scoreFileSorting(
  sandbox: EvalSandbox
): Promise<AutomatedScores> {
  const allFiles = await sandbox.listFiles();
  const manifestPath = join(
    process.cwd(),
    "tasks",
    "file-sorting",
    "expected",
    "manifest.json"
  );
  const expectedManifest = JSON.parse(
    await readFile(manifestPath, "utf-8")
  ) as Record<string, string>;
  const expectedEntries = Object.entries(expectedManifest);

  const actualByFilename = new Map<string, string>();
  for (const path of allFiles) {
    if (path === "MANIFEST.md") continue;
    actualByFilename.set(basename(path), path);
  }

  const filesInRoot = allFiles.filter(
    (f) => !f.includes("/") && f !== "MANIFEST.md"
  );
  let correctlyPlaced = 0;
  for (const [filename, expectedPath] of expectedEntries) {
    const actualPath = actualByFilename.get(filename);
    if (actualPath === expectedPath) {
      correctlyPlaced++;
    }
  }
  const totalFiles = expectedEntries.length;
  const filesUntouched = filesInRoot.length;

  return {
    totalFiles,
    correctlyPlaced,
    sortAccuracy: totalFiles > 0 ? correctlyPlaced / totalFiles : 0,
    filesUntouched,
  };
}
