import type { EvalSandbox } from "../sandbox/create.js";
import type { AutomatedScores } from "../types.js";

interface DeliverableRule {
  aliases: string[];
  check(content: string): boolean;
}

const DELIVERABLE_RULES: DeliverableRule[] = [
  {
    aliases: ["tagline"],
    check(content) {
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      return lines.length === 1 && wordCount > 0 && wordCount <= 20;
    },
  },
  {
    aliases: ["hero-copy", "hero_copy", "herocopy"],
    check(content) {
      const sections = content
        .split(/\n\s*\n/)
        .map((section) => section.trim())
        .filter((section) => section.length > 0);
      return sections.length >= 3;
    },
  },
  {
    aliases: ["email-sequence", "email_sequence", "emailsequence", "email"],
    check(content) {
      const subjectCount = content.match(/subject\s*:/gi)?.length ?? 0;
      return subjectCount >= 3;
    },
  },
  {
    aliases: ["social-posts", "social_posts", "socialposts", "social"],
    check(content) {
      const hasTwitter = /twitter|x\s*:/i.test(content);
      const hasInstagram = /instagram/i.test(content);
      const hasLinkedIn = /linkedin/i.test(content);
      const postMarkers = content.match(/^\s*(?:\d+[\).:-]|[-*])\s+/gm)?.length ?? 0;
      return hasTwitter && hasInstagram && hasLinkedIn && postMarkers >= 6;
    },
  },
  {
    aliases: ["landing-page", "landing_page", "landingpage", "landing"],
    check(content) {
      const faqQuestions = content.match(/\?/g)?.length ?? 0;
      const hasCta = /cta|call to action|shop now|reserve|buy now|get started/i.test(
        content
      );
      return faqQuestions >= 5 && hasCta;
    },
  },
  {
    aliases: ["press-release", "press_release", "pressrelease", "press"],
    check(content) {
      return (
        /headline/i.test(content) &&
        /dateline/i.test(content) &&
        /boilerplate/i.test(content)
      );
    },
  },
];

export async function scoreCopywriting(
  sandbox: EvalSandbox
): Promise<AutomatedScores> {
  const allFiles = await sandbox.listFiles();
  let deliverablesProduced = 0;
  let totalWordCount = 0;
  let requirementChecksPassed = 0;

  for (const rule of DELIVERABLE_RULES) {
    const aliases = rule.aliases;
    const found = allFiles.find((f) => {
      const lower = f.toLowerCase();
      return aliases.some((keyword) => lower.includes(keyword));
    });
    if (found) {
      deliverablesProduced++;
      try {
        const content = await sandbox.readFile(found);
        totalWordCount += content.split(/\s+/).filter(Boolean).length;
        if (rule.check(content)) {
          requirementChecksPassed++;
        }
      } catch {
        // file exists in listing but can't be read — still count it
      }
    }
  }

  return {
    deliverablesRequested: DELIVERABLE_RULES.length,
    deliverablesProduced,
    completenessRate: deliverablesProduced / DELIVERABLE_RULES.length,
    totalWordCount,
    requirementChecksPassed,
    requirementChecksTotal: DELIVERABLE_RULES.length,
    requirementComplianceRate:
      requirementChecksPassed / DELIVERABLE_RULES.length,
  };
}
