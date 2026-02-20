import { getSystemPrompt, wrapPrompt } from "../src/prompts/tones.js";
import { COPYWRITING_PROMPT } from "../src/prompts/copywriting.js";
import { CODING_PROMPT } from "../src/prompts/coding.js";
import { FILE_SORTING_PROMPT } from "../src/prompts/file-sorting.js";

console.log("=== System Prompts ===");
console.log("Casual:", getSystemPrompt("casual").slice(0, 100) + "...");
console.log("Formal:", getSystemPrompt("formal").slice(0, 100) + "...");

console.log("\n=== Copywriting Prompt (casual first 300 chars) ===");
console.log(wrapPrompt(COPYWRITING_PROMPT, "casual").slice(0, 300));

console.log("\n=== Copywriting Prompt (formal first 300 chars) ===");
console.log(wrapPrompt(COPYWRITING_PROMPT, "formal").slice(0, 300));

console.log("\n=== Prompt lengths ===");
console.log("Coding casual:", wrapPrompt(CODING_PROMPT, "casual").length);
console.log("Coding formal:", wrapPrompt(CODING_PROMPT, "formal").length);
console.log("File-sorting casual:", wrapPrompt(FILE_SORTING_PROMPT, "casual").length);
console.log("File-sorting formal:", wrapPrompt(FILE_SORTING_PROMPT, "formal").length);

console.log("\nPrompt tests passed!");
