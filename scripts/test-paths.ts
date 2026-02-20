import { createBashTool } from "bash-tool";

async function main() {
  const { sandbox } = await createBashTool({
    files: { "hello.txt": "world" },
    destination: "./workspace",
  });

  const pwd = await sandbox.executeCommand("pwd");
  console.log("pwd:", pwd.stdout.trim());

  const find = await sandbox.executeCommand("find / -type f 2>/dev/null | head -20");
  console.log("all files:", find.stdout.trim());

  // Try various path forms
  for (const p of ["hello.txt", "./hello.txt", "workspace/hello.txt", "/workspace/hello.txt"]) {
    try {
      const c = await sandbox.readFile(p);
      console.log(`readFile("${p}") -> OK: "${c}"`);
    } catch (e: unknown) {
      console.log(`readFile("${p}") -> FAIL: ${(e as Error).message}`);
    }
  }

  // Try cat via bash
  const cat = await sandbox.executeCommand("cat hello.txt");
  console.log("cat hello.txt:", cat.stdout.trim(), "exitCode:", cat.exitCode);
}

main().catch(console.error);
