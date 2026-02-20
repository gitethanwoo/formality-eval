import { createBashTool } from "bash-tool";
import { join } from "node:path";

async function main() {
  const seedDir = join(process.cwd(), "tasks", "file-sorting", "seed");
  const { sandbox } = await createBashTool({
    uploadDirectory: { source: seedDir, include: "**/*" },
    destination: "./workspace",
  });

  // Check pwd
  const pwd = await sandbox.executeCommand("pwd");
  console.log("pwd:", pwd.stdout.trim());

  // List via bash
  const ls = await sandbox.executeCommand("ls -la | head -10");
  console.log("ls -la:", ls.stdout.trim());

  // Try reading a non-dotfile
  const find = await sandbox.executeCommand("find . -type f -name '*.ts' | head -3");
  console.log("ts files:", find.stdout.trim());

  // Try cat
  const tsFile = find.stdout.trim().split("\n")[0];
  const cat = await sandbox.executeCommand(`cat "${tsFile}"`);
  console.log(`cat ${tsFile}:`, cat.stdout.trim().slice(0, 80));

  // Now try sandbox.readFile with the same file
  const relativePath = tsFile.replace("./", "");
  for (const prefix of ["", "/workspace/", "workspace/", "./workspace/", "./"]) {
    try {
      const c = await sandbox.readFile(`${prefix}${relativePath}`);
      console.log(`readFile("${prefix}${relativePath}") -> OK (${c.length} chars)`);
    } catch (e: unknown) {
      console.log(`readFile("${prefix}${relativePath}") -> FAIL: ${(e as Error).message}`);
    }
  }

  // Check if dotfiles were uploaded
  const dotfiles = await sandbox.executeCommand("ls -la .env* .eslint* 2>&1");
  console.log("\ndotfiles:", dotfiles.stdout.trim());

  // Check full filesystem paths
  const allFiles = await sandbox.executeCommand("find / -path '/workspace/*' -type f 2>/dev/null | head -5");
  console.log("\nFull paths:", allFiles.stdout.trim());
}

main().catch(console.error);
