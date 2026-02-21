import type { EvalSandbox } from "../sandbox/create.js";
import type { AutomatedScores } from "../types.js";

export async function scoreCoding(sandbox: EvalSandbox): Promise<AutomatedScores> {
  let linesOfCode = 0;
  let testsWritten = 0;
  let testsPassing: number | undefined;

  // List all .ts files via bash
  const allFiles = await sandbox.listFiles();
  const tsFiles = allFiles.filter((f) => f.endsWith(".ts"));
  const testFiles = tsFiles.filter(
    (f) => f.includes(".test.") || f.includes(".spec.")
  );

  // Count lines of code
  for (const file of tsFiles) {
    try {
      const content = await sandbox.readFile(file);
      linesOfCode += content.split("\n").filter((l) => l.trim().length > 0).length;
    } catch {
      // skip unreadable files
    }
  }

  const assertionCounts = new Map<string, number>();

  // Count assertions in tests
  if (testFiles.length > 0) {
    for (const testFile of testFiles) {
      try {
        const content = await sandbox.readFile(testFile);
        const assertMatches = content.match(
          /assert|expect|throw|===|!==|console\.assert/g
        );
        const count = assertMatches?.length ?? 0;
        testsWritten += count;
        assertionCounts.set(testFile, count);
      } catch {
        // skip
      }
    }
  }

  const runtimeCheck = await sandbox.sandbox.executeCommand("command -v node >/dev/null 2>&1");
  const testsExecutable = runtimeCheck.exitCode === 0;

  // Only report pass metrics if tests can actually run.
  if (testFiles.length > 0 && testsExecutable) {
    testsPassing = 0;
    for (const testFile of testFiles) {
      const result = await sandbox.sandbox.executeCommand(
        `node "${testFile}" >/dev/null 2>&1`
      );
      if (result.exitCode === 0) {
        testsPassing += assertionCounts.get(testFile) ?? 0;
      }
    }
  }

  // Check for edge case coverage by scanning for keywords
  let edgeCasesCovered = 0;
  const edgeCasePatterns = [
    /empty/i,
    /null/i,
    /malform/i,
    /escape/i,
    /quote/i,
    /delimiter/i,
    /newline/i,
    /whitespace/i,
    /single.*row/i,
    /single.*column/i,
    /large/i,
    /error/i,
  ];
  for (const testFile of testFiles) {
    try {
      const content = await sandbox.readFile(testFile);
      for (const pattern of edgeCasePatterns) {
        if (pattern.test(content)) edgeCasesCovered++;
      }
    } catch {
      // skip
    }
  }

  return {
    testsWritten,
    testsPassing,
    testPassRate:
      testsPassing !== undefined && testsWritten > 0
        ? testsPassing / testsWritten
        : undefined,
    testsExecutable,
    linesOfCode,
    edgeCasesCovered,
  };
}
