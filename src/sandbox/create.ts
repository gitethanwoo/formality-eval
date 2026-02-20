import { createBashTool } from "bash-tool";
import type { BashToolkit, Sandbox } from "bash-tool";
import { join } from "node:path";
import type { TaskType } from "../types.js";

export interface EvalSandbox {
  tools: BashToolkit["tools"];
  sandbox: Sandbox;
  /** List all files in the sandbox (relative paths from workspace root) */
  listFiles(): Promise<string[]>;
  /** Read a file from the sandbox (relative path from workspace root) */
  readFile(path: string): Promise<string>;
}

export async function createSandbox(task: TaskType): Promise<EvalSandbox> {
  const seedDir = join(process.cwd(), "tasks", task, "seed");

  const { tools, sandbox } = await createBashTool({
    uploadDirectory: {
      source: seedDir,
      include: "**/*",
    },
    destination: "./workspace",
  });

  // Discover the actual cwd inside the virtual FS (bash-tool maps destination to it)
  const pwdResult = await sandbox.executeCommand("pwd");
  const sandboxCwd = pwdResult.stdout.trim();

  return {
    tools,
    sandbox,
    async listFiles() {
      const result = await sandbox.executeCommand(
        "find . -type f | sed 's|^\\./||' | sort"
      );
      return result.stdout
        .trim()
        .split("\n")
        .filter(Boolean);
    },
    async readFile(path: string) {
      // sandbox.readFile needs the full virtual FS path
      return sandbox.readFile(`${sandboxCwd}/${path}`);
    },
  };
}
