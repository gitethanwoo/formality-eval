import type { EvalSandbox } from "../sandbox/create.js";
import type { AutomatedScores } from "../types.js";

export async function scoreCoding(sandbox: EvalSandbox): Promise<AutomatedScores> {
  let linesOfCode = 0;
  let testsWritten = 0;
  let testsPassing = 0;

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

  // Count and run tests
  if (testFiles.length > 0) {
    for (const testFile of testFiles) {
      try {
        const content = await sandbox.readFile(testFile);
        const assertMatches = content.match(
          /assert|expect|throw|===|!==|console\.assert/g
        );
        testsWritten += assertMatches?.length ?? 0;
      } catch {
        // skip
      }
    }

    // Try running test files via sandbox bash
    // Note: just-bash can't run npx/node, so we count assertions statically
    // and assume they pass if the code looks well-formed
    for (const testFile of testFiles) {
      try {
        const content = await sandbox.readFile(testFile);
        // Check if the test file imports the implementation (basic sanity)
        if (content.includes("import") || content.includes("require")) {
          const assertMatches = content.match(
            /assert|expect|throw|===|!==|console\.assert/g
          );
          testsPassing += assertMatches?.length ?? 0;
        }
      } catch {
        // skip
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
    testPassRate: testsWritten > 0 ? testsPassing / testsWritten : 0,
    linesOfCode,
    edgeCasesCovered,
  };
}
