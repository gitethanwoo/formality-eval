import { createBashTool } from "bash-tool";

async function main() {
  const { sandbox } = await createBashTool({
    files: { "existing.txt": "hello" },
    destination: "./workspace",
  });

  const pwd = await sandbox.executeCommand("pwd");
  console.log("cwd:", pwd.stdout.trim());

  // Write via sandbox.writeFiles
  await sandbox.writeFiles([
    { path: "test1.txt", content: "direct" },
    { path: "/home/user/project/test2.txt", content: "absolute" },
  ]);

  // Write via bash echo
  await sandbox.executeCommand('echo "bash-written" > test3.txt');

  // Check what's visible
  const find = await sandbox.executeCommand("find . -type f | sort");
  console.log("files after write:", find.stdout.trim());

  // Try to read each
  for (const p of ["test1.txt", "test2.txt", "test3.txt", "existing.txt"]) {
    const cat = await sandbox.executeCommand(`cat ${p} 2>&1`);
    console.log(`cat ${p}: ${cat.stdout.trim()} (exit ${cat.exitCode})`);
  }
}

main().catch(console.error);
