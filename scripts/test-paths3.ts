import { createBashTool } from "bash-tool";
import { join } from "node:path";

async function main() {
  const seedDir = join(process.cwd(), "tasks", "file-sorting", "seed");
  const { sandbox } = await createBashTool({
    uploadDirectory: { source: seedDir, include: "**/*" },
    destination: "./workspace",
  });

  const pwd = await sandbox.executeCommand("pwd");
  const cwd = pwd.stdout.trim();
  console.log("cwd:", cwd);

  // Try reading with cwd prefix
  for (const p of [
    `${cwd}/api_handler.ts`,
    "/home/user/project/api_handler.ts",
    "home/user/project/api_handler.ts",
  ]) {
    try {
      const c = await sandbox.readFile(p);
      console.log(`readFile("${p}") -> OK (${c.length} chars)`);
    } catch (e: unknown) {
      console.log(`readFile("${p}") -> FAIL`);
    }
  }

  // Alternative: just use executeCommand("cat ...") for reading
  const cat = await sandbox.executeCommand("cat api_handler.ts");
  console.log(`cat api_handler.ts -> OK (${cat.stdout.length} chars)`);
}

main().catch(console.error);
