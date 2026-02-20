import { createSandbox } from "../src/sandbox/create.js";

async function main() {
  console.log("=== Testing file-sorting sandbox ===");
  const fsSandbox = await createSandbox("file-sorting");
  const files = await fsSandbox.listFiles();
  console.log("Files loaded:", files.length);
  console.log("First 5:", files.slice(0, 5));

  const content = await fsSandbox.readFile(files[0]);
  console.log("Read file content:", JSON.stringify(content.slice(0, 80)));

  const result = await fsSandbox.sandbox.executeCommand("ls | head -5");
  console.log("Bash ls output:", result.stdout.trim());
  console.log("Exit code:", result.exitCode);

  // Test writeFile via bash tool
  const mvResult = await fsSandbox.sandbox.executeCommand("mkdir -p photos && mv *.jpg photos/ 2>/dev/null; ls photos/");
  console.log("\nMoved jpgs to photos/:", mvResult.stdout.trim());

  console.log("\n=== Testing coding sandbox ===");
  const codeSandbox = await createSandbox("coding");
  const codeFiles = await codeSandbox.listFiles();
  console.log("Coding seed files:", codeFiles);

  console.log("\n=== Testing copywriting sandbox ===");
  const copySandbox = await createSandbox("copywriting");
  const copyFiles = await copySandbox.listFiles();
  console.log("Copywriting seed files:", copyFiles);

  console.log("\nAll sandbox tests passed!");
}

main().catch(console.error);
