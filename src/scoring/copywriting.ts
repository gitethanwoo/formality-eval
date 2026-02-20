import type { EvalSandbox } from "../sandbox/create.js";
import type { AutomatedScores } from "../types.js";

// Canonical deliverable groups (6 deliverables)
const DELIVERABLE_GROUPS = [
  ["tagline"],
  ["hero-copy", "hero_copy", "herocopy"],
  ["email-sequence", "email_sequence", "emailsequence", "email"],
  ["social-posts", "social_posts", "socialposts", "social"],
  ["landing-page", "landing_page", "landingpage", "landing"],
  ["press-release", "press_release", "pressrelease", "press"],
];

export async function scoreCopywriting(
  sandbox: EvalSandbox
): Promise<AutomatedScores> {
  const allFiles = await sandbox.listFiles();
  let deliverablesProduced = 0;
  let totalWordCount = 0;

  for (const group of DELIVERABLE_GROUPS) {
    const found = allFiles.find((f) => {
      const lower = f.toLowerCase();
      return group.some((keyword) => lower.includes(keyword));
    });
    if (found) {
      deliverablesProduced++;
      try {
        const content = await sandbox.readFile(found);
        totalWordCount += content.split(/\s+/).filter(Boolean).length;
      } catch {
        // file exists in listing but can't be read — still count it
      }
    }
  }

  return {
    deliverablesRequested: DELIVERABLE_GROUPS.length,
    deliverablesProduced,
    completenessRate: deliverablesProduced / DELIVERABLE_GROUPS.length,
    totalWordCount,
  };
}
