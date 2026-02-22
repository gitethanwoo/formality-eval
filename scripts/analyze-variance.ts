import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JudgedEvalResult, ToneStyle, TaskType } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TONES: ToneStyle[] = ["casual", "controlled", "formal"];
const TASKS: TaskType[] = ["copywriting", "coding", "file-sorting"];

function compositeScore(r: JudgedEvalResult): number {
  const j = r.judgeScores;
  return ((j.quality + j.thoroughness + j.creativity + j.adherenceToInstructions) / 4) * 10;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return NaN;
  const avg = mean(nums);
  const variance = nums.reduce((sum, n) => sum + (n - avg) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

function coeffOfVariation(nums: number[]): number {
  const m = mean(nums);
  if (m === 0) return NaN;
  return stddev(nums) / m;
}

function fmt(n: number, decimals = 2): string {
  if (Number.isNaN(n)) return "N/A";
  return n.toFixed(decimals);
}

function fmtPct(n: number, decimals = 2): string {
  if (Number.isNaN(n)) return "N/A";
  return n.toFixed(decimals) + "%";
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function markdownTable(headers: string[], rows: string[][], alignRight: boolean[] = []): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i]?.length ?? 0))
  );
  const padFn = (s: string, i: number) =>
    alignRight[i] ? padLeft(s, colWidths[i]) : padRight(s, colWidths[i]);

  const headerLine = "| " + headers.map((h, i) => padFn(h, i)).join(" | ") + " |";
  const sepLine = "| " + colWidths.map((w, i) =>
    alignRight[i] ? "-".repeat(w - 1) + ":" : "-".repeat(w)
  ).join(" | ") + " |";
  const bodyLines = rows.map(
    r => "| " + r.map((c, i) => padFn(c, i)).join(" | ") + " |"
  );
  return [headerLine, sepLine, ...bodyLines].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const combinedPath = join(process.cwd(), "results", "judge-scores", "combined.json");
  const allResults = JSON.parse(await readFile(combinedPath, "utf-8")) as JudgedEvalResult[];

  console.log(`# Variance & Tone Sensitivity Analysis\n`);
  console.log(`Total entries: ${allResults.length}`);
  console.log(`Models: ${[...new Set(allResults.map(r => r.config.model.label))].sort().join(", ")}`);
  console.log(`Tones: ${TONES.join(", ")}`);
  console.log(`Tasks: ${TASKS.join(", ")}`);
  console.log();

  // =========================================================================
  // FINDING 3: Consistency/Variance by Tone
  // =========================================================================
  console.log("---");
  console.log("# FINDING_3: Consistency/Variance by Tone\n");

  // --- 3a. Overall variance by tone ---
  console.log("## 3a. Overall Variance by Tone\n");
  console.log("Composite score = (quality + thoroughness + creativity + adherence) / 4 * 10\n");

  {
    const headers = ["Tone", "N", "Mean", "StdDev", "CV (stddev/mean)", "Min", "Max", "Range"];
    const align = [false, true, true, true, true, true, true, true];
    const rows = TONES.map(tone => {
      const scores = allResults.filter(r => r.config.tone === tone).map(compositeScore);
      const m = mean(scores);
      const sd = stddev(scores);
      const cv = coeffOfVariation(scores);
      const mn = Math.min(...scores);
      const mx = Math.max(...scores);
      return [
        tone,
        String(scores.length),
        fmtPct(m),
        fmtPct(sd),
        fmt(cv, 4),
        fmtPct(mn),
        fmtPct(mx),
        fmtPct(mx - mn),
      ];
    });
    console.log(markdownTable(headers, rows, align));
  }

  console.log();

  // --- 3b. Variance by Tone x Task ---
  console.log("## 3b. Variance by Tone x Task\n");

  for (const task of TASKS) {
    console.log(`### ${task}\n`);
    const headers = ["Tone", "N", "Mean", "StdDev", "CV", "Min", "Max", "Range"];
    const align = [false, true, true, true, true, true, true, true];
    const rows = TONES.map(tone => {
      const scores = allResults
        .filter(r => r.config.tone === tone && r.config.task === task)
        .map(compositeScore);
      const m = mean(scores);
      const sd = stddev(scores);
      const cv = coeffOfVariation(scores);
      const mn = Math.min(...scores);
      const mx = Math.max(...scores);
      return [
        tone,
        String(scores.length),
        fmtPct(m),
        fmtPct(sd),
        fmt(cv, 4),
        fmtPct(mn),
        fmtPct(mx),
        fmtPct(mx - mn),
      ];
    });
    console.log(markdownTable(headers, rows, align));
    console.log();
  }

  // --- 3c. Comparative summary: which tone is most consistent? ---
  console.log("## 3c. Consistency Ranking (lower CV = more consistent)\n");

  {
    console.log("### Overall\n");
    const toneStats = TONES.map(tone => {
      const scores = allResults.filter(r => r.config.tone === tone).map(compositeScore);
      return { tone, mean: mean(scores), sd: stddev(scores), cv: coeffOfVariation(scores), range: Math.max(...scores) - Math.min(...scores) };
    });
    toneStats.sort((a, b) => a.cv - b.cv);
    const headers = ["Rank", "Tone", "CV", "StdDev", "Mean", "Range"];
    const rows = toneStats.map((s, i) => [
      String(i + 1),
      s.tone,
      fmt(s.cv, 4),
      fmtPct(s.sd),
      fmtPct(s.mean),
      fmtPct(s.range),
    ]);
    console.log(markdownTable(headers, rows, [true, false, true, true, true, true]));
    console.log();

    console.log("### By Task\n");
    for (const task of TASKS) {
      console.log(`**${task}:**\n`);
      const taskStats = TONES.map(tone => {
        const scores = allResults
          .filter(r => r.config.tone === tone && r.config.task === task)
          .map(compositeScore);
        return { tone, cv: coeffOfVariation(scores), sd: stddev(scores), mean: mean(scores), range: Math.max(...scores) - Math.min(...scores) };
      });
      taskStats.sort((a, b) => a.cv - b.cv);
      const headers2 = ["Rank", "Tone", "CV", "StdDev", "Mean", "Range"];
      const rows2 = taskStats.map((s, i) => [
        String(i + 1),
        s.tone,
        fmt(s.cv, 4),
        fmtPct(s.sd),
        fmtPct(s.mean),
        fmtPct(s.range),
      ]);
      console.log(markdownTable(headers2, rows2, [true, false, true, true, true, true]));
      console.log();
    }
  }

  // =========================================================================
  // FINDING 4: Model Capability vs Tone Sensitivity
  // =========================================================================
  console.log("---");
  console.log("# FINDING_4: Model Capability vs Tone Sensitivity\n");

  // --- 4a. Model ranking by overall mean composite ---
  console.log("## 4a. Model Ranking by Overall Mean Composite Score\n");

  const models = [...new Set(allResults.map(r => r.config.model.label))].sort();

  {
    const modelStats = models.map(model => {
      const scores = allResults.filter(r => r.config.model.label === model).map(compositeScore);
      const tier = allResults.find(r => r.config.model.label === model)!.config.model.tier;
      return { model, tier, mean: mean(scores), sd: stddev(scores), n: scores.length };
    });
    modelStats.sort((a, b) => b.mean - a.mean);

    const headers = ["Rank", "Model", "Tier", "N", "Mean Composite", "StdDev"];
    const rows = modelStats.map((s, i) => [
      String(i + 1),
      s.model,
      s.tier,
      String(s.n),
      fmtPct(s.mean),
      fmtPct(s.sd),
    ]);
    console.log(markdownTable(headers, rows, [true, false, false, true, true, true]));
  }

  console.log();

  // --- 4b. Formal-Casual delta per model ---
  console.log("## 4b. Formal-Casual Delta by Model\n");
  console.log("Positive delta = formal outperforms casual. Sorted by overall model strength.\n");

  {
    const modelDeltas = models.map(model => {
      const allScores = allResults.filter(r => r.config.model.label === model).map(compositeScore);
      const casualScores = allResults
        .filter(r => r.config.model.label === model && r.config.tone === "casual")
        .map(compositeScore);
      const formalScores = allResults
        .filter(r => r.config.model.label === model && r.config.tone === "formal")
        .map(compositeScore);
      const tier = allResults.find(r => r.config.model.label === model)!.config.model.tier;
      return {
        model,
        tier,
        overallMean: mean(allScores),
        casualMean: mean(casualScores),
        formalMean: mean(formalScores),
        delta: mean(formalScores) - mean(casualScores),
        nCasual: casualScores.length,
        nFormal: formalScores.length,
      };
    });
    modelDeltas.sort((a, b) => b.overallMean - a.overallMean);

    const headers = ["Model", "Tier", "Overall Mean", "Casual Mean", "Formal Mean", "Delta (F-C)", "N(cas)", "N(for)"];
    const rows = modelDeltas.map(s => [
      s.model,
      s.tier,
      fmtPct(s.overallMean),
      fmtPct(s.casualMean),
      fmtPct(s.formalMean),
      (s.delta >= 0 ? "+" : "") + fmtPct(s.delta),
      String(s.nCasual),
      String(s.nFormal),
    ]);
    console.log(markdownTable(headers, rows, [false, false, true, true, true, true, true, true]));
  }

  console.log();

  // --- 4c. Formal-Casual delta by model x task ---
  console.log("## 4c. Formal-Casual Delta by Model x Task\n");

  {
    const headers = ["Model", "Tier", "Task", "Casual Mean", "Formal Mean", "Delta (F-C)"];
    const align = [false, false, false, true, true, true];
    const rows: string[][] = [];

    // Sort models by overall mean descending
    const modelsByMean = models
      .map(model => ({
        model,
        mean: mean(allResults.filter(r => r.config.model.label === model).map(compositeScore)),
      }))
      .sort((a, b) => b.mean - a.mean)
      .map(s => s.model);

    for (const model of modelsByMean) {
      const tier = allResults.find(r => r.config.model.label === model)!.config.model.tier;
      for (const task of TASKS) {
        const casualScores = allResults
          .filter(r => r.config.model.label === model && r.config.task === task && r.config.tone === "casual")
          .map(compositeScore);
        const formalScores = allResults
          .filter(r => r.config.model.label === model && r.config.task === task && r.config.tone === "formal")
          .map(compositeScore);
        if (casualScores.length === 0 || formalScores.length === 0) continue;
        const delta = mean(formalScores) - mean(casualScores);
        rows.push([
          model,
          tier,
          task,
          fmtPct(mean(casualScores)),
          fmtPct(mean(formalScores)),
          (delta >= 0 ? "+" : "") + fmtPct(delta),
        ]);
      }
    }
    console.log(markdownTable(headers, rows, align));
  }

  console.log();

  // --- 4d. Tier-level analysis ---
  console.log("## 4d. Formal-Casual Delta by Model Tier\n");
  console.log("Aggregated across all models within each tier.\n");

  {
    const tiers = ["large", "small"] as const;
    const headers = ["Tier", "Models", "Overall Mean", "Casual Mean", "Formal Mean", "Delta (F-C)", "N(cas)", "N(for)"];
    const align = [false, false, true, true, true, true, true, true];
    const rows = tiers.map(tier => {
      const tierResults = allResults.filter(r => r.config.model.tier === tier);
      const tierModels = [...new Set(tierResults.map(r => r.config.model.label))].sort();
      const allScores = tierResults.map(compositeScore);
      const casualScores = tierResults.filter(r => r.config.tone === "casual").map(compositeScore);
      const formalScores = tierResults.filter(r => r.config.tone === "formal").map(compositeScore);
      const delta = mean(formalScores) - mean(casualScores);
      return [
        tier,
        tierModels.join(", "),
        fmtPct(mean(allScores)),
        fmtPct(mean(casualScores)),
        fmtPct(mean(formalScores)),
        (delta >= 0 ? "+" : "") + fmtPct(delta),
        String(casualScores.length),
        String(formalScores.length),
      ];
    });
    console.log(markdownTable(headers, rows, align));
  }

  console.log();

  // --- 4e. Tier-level by task ---
  console.log("## 4e. Formal-Casual Delta by Tier x Task\n");

  {
    const tiers = ["large", "small"] as const;
    const headers = ["Tier", "Task", "Casual Mean", "Formal Mean", "Delta (F-C)"];
    const align = [false, false, true, true, true];
    const rows: string[][] = [];

    for (const tier of tiers) {
      for (const task of TASKS) {
        const casualScores = allResults
          .filter(r => r.config.model.tier === tier && r.config.task === task && r.config.tone === "casual")
          .map(compositeScore);
        const formalScores = allResults
          .filter(r => r.config.model.tier === tier && r.config.task === task && r.config.tone === "formal")
          .map(compositeScore);
        if (casualScores.length === 0 || formalScores.length === 0) continue;
        const delta = mean(formalScores) - mean(casualScores);
        rows.push([
          tier,
          task,
          fmtPct(mean(casualScores)),
          fmtPct(mean(formalScores)),
          (delta >= 0 ? "+" : "") + fmtPct(delta),
        ]);
      }
    }
    console.log(markdownTable(headers, rows, align));
  }

  console.log();

  // --- 4f. Correlation: model strength vs tone sensitivity ---
  console.log("## 4f. Correlation: Model Strength vs Tone Sensitivity\n");
  console.log("Does being a stronger model predict larger or smaller formal-casual deltas?\n");

  {
    const modelData = models.map(model => {
      const allScores = allResults.filter(r => r.config.model.label === model).map(compositeScore);
      const casualScores = allResults
        .filter(r => r.config.model.label === model && r.config.tone === "casual")
        .map(compositeScore);
      const formalScores = allResults
        .filter(r => r.config.model.label === model && r.config.tone === "formal")
        .map(compositeScore);
      return {
        model,
        overallMean: mean(allScores),
        delta: mean(formalScores) - mean(casualScores),
        absDelta: Math.abs(mean(formalScores) - mean(casualScores)),
      };
    });
    modelData.sort((a, b) => b.overallMean - a.overallMean);

    const headers = ["Model", "Overall Mean", "F-C Delta", "|F-C Delta|", "Interpretation"];
    const rows = modelData.map(s => {
      let interp: string;
      if (s.absDelta < 1) interp = "Tone-insensitive";
      else if (s.absDelta < 3) interp = "Mildly tone-sensitive";
      else if (s.absDelta < 5) interp = "Moderately tone-sensitive";
      else interp = "Highly tone-sensitive";
      return [
        s.model,
        fmtPct(s.overallMean),
        (s.delta >= 0 ? "+" : "") + fmtPct(s.delta),
        fmtPct(s.absDelta),
        interp,
      ];
    });
    console.log(markdownTable(headers, rows, [false, true, true, true, false]));

    // Compute Pearson r between overall mean and delta (signed)
    if (modelData.length >= 3) {
      const xs = modelData.map(d => d.overallMean);
      const ys = modelData.map(d => d.delta);
      const r = pearson(xs, ys);
      console.log(`\nPearson r (overall mean vs F-C delta): ${fmt(r, 4)} (n=${modelData.length})`);
      console.log(`Interpretation: ${
        Math.abs(r) < 0.3 ? "Weak/no linear relationship" :
        Math.abs(r) < 0.7 ? "Moderate linear relationship" :
        "Strong linear relationship"
      } between model strength and tone sensitivity.`);
    }

    // Also compute for absolute delta
    if (modelData.length >= 3) {
      const xs = modelData.map(d => d.overallMean);
      const ys = modelData.map(d => d.absDelta);
      const r = pearson(xs, ys);
      console.log(`Pearson r (overall mean vs |F-C delta|): ${fmt(r, 4)} (n=${modelData.length})`);
    }
  }

  console.log();

  // =========================================================================
  // Narrative Findings
  // =========================================================================
  console.log("---");
  console.log("# Summary of Findings\n");

  // Build narrative for Finding 3
  {
    const toneStats = TONES.map(tone => {
      const scores = allResults.filter(r => r.config.tone === tone).map(compositeScore);
      return { tone, mean: mean(scores), sd: stddev(scores), cv: coeffOfVariation(scores), range: Math.max(...scores) - Math.min(...scores) };
    });

    const mostConsistent = [...toneStats].sort((a, b) => a.cv - b.cv)[0];
    const leastConsistent = [...toneStats].sort((a, b) => b.cv - a.cv)[0];

    console.log("## FINDING_3: Consistency/Variance by Tone\n");
    console.log(`Overall, **${mostConsistent.tone}** is the most consistent tone (CV=${fmt(mostConsistent.cv, 4)}, SD=${fmtPct(mostConsistent.sd)}, range=${fmtPct(mostConsistent.range)}), while **${leastConsistent.tone}** is the least consistent (CV=${fmt(leastConsistent.cv, 4)}, SD=${fmtPct(leastConsistent.sd)}, range=${fmtPct(leastConsistent.range)}).`);
    console.log();

    // Per-task breakdown summary
    console.log("Per-task consistency winner (lowest CV):");
    for (const task of TASKS) {
      const taskStats = TONES.map(tone => {
        const scores = allResults
          .filter(r => r.config.tone === tone && r.config.task === task)
          .map(compositeScore);
        return { tone, cv: coeffOfVariation(scores), sd: stddev(scores), range: Math.max(...scores) - Math.min(...scores) };
      });
      const best = [...taskStats].sort((a, b) => a.cv - b.cv)[0];
      console.log(`  - ${task}: **${best.tone}** (CV=${fmt(best.cv, 4)}, SD=${fmtPct(best.sd)}, range=${fmtPct(best.range)})`);
    }

    const formalStats = toneStats.find(s => s.tone === "formal")!;
    const casualStats = toneStats.find(s => s.tone === "casual")!;
    const isFormalMoreReliable = formalStats.cv < casualStats.cv;
    console.log();
    console.log(`Is formal more reliable than casual? **${isFormalMoreReliable ? "Yes" : "No"}**. Formal CV=${fmt(formalStats.cv, 4)} vs Casual CV=${fmt(casualStats.cv, 4)}. ${
      isFormalMoreReliable
        ? `Formal produces more consistent results (lower spread). Even if mean differences are small, a team optimizing for predictability would prefer formal.`
        : `Casual actually produces more consistent results despite potentially different mean scores. The formal tone introduces more variance.`
    }`);
    console.log();
  }

  // Build narrative for Finding 4
  {
    const modelData = models.map(model => {
      const allScores = allResults.filter(r => r.config.model.label === model).map(compositeScore);
      const casualScores = allResults
        .filter(r => r.config.model.label === model && r.config.tone === "casual")
        .map(compositeScore);
      const formalScores = allResults
        .filter(r => r.config.model.label === model && r.config.tone === "formal")
        .map(compositeScore);
      const tier = allResults.find(r => r.config.model.label === model)!.config.model.tier;
      return {
        model,
        tier,
        overallMean: mean(allScores),
        delta: mean(formalScores) - mean(casualScores),
        absDelta: Math.abs(mean(formalScores) - mean(casualScores)),
      };
    });
    modelData.sort((a, b) => b.overallMean - a.overallMean);

    console.log("## FINDING_4: Model Capability vs Tone Sensitivity\n");
    console.log("Model ranking (strongest to weakest) and their formal-casual delta:");
    for (const d of modelData) {
      console.log(`  ${d.model} (${d.tier}): mean=${fmtPct(d.overallMean)}, F-C delta=${(d.delta >= 0 ? "+" : "") + fmtPct(d.delta)}`);
    }
    console.log();

    // Tier analysis
    const tiers = ["large", "small"] as const;
    for (const tier of tiers) {
      const tierResults = allResults.filter(r => r.config.model.tier === tier);
      const casualScores = tierResults.filter(r => r.config.tone === "casual").map(compositeScore);
      const formalScores = tierResults.filter(r => r.config.tone === "formal").map(compositeScore);
      const delta = mean(formalScores) - mean(casualScores);
      console.log(`${tier} tier F-C delta: ${(delta >= 0 ? "+" : "") + fmtPct(delta)}`);
    }
    console.log();

    // Determine the pattern
    const largeModels = modelData.filter(d => d.tier === "large");
    const smallModels = modelData.filter(d => d.tier === "small");
    const avgLargeDelta = mean(largeModels.map(d => d.delta));
    const avgSmallDelta = mean(smallModels.map(d => d.delta));

    const strongerBenefitMore = avgLargeDelta > avgSmallDelta;
    console.log(`Pattern: ${
      strongerBenefitMore
        ? `Larger/stronger models benefit MORE from formal prompts (avg delta: large=${(avgLargeDelta >= 0 ? "+" : "") + fmtPct(avgLargeDelta)} vs small=${(avgSmallDelta >= 0 ? "+" : "") + fmtPct(avgSmallDelta)}). This suggests tone sensitivity may be a marker of model sophistication -- stronger models are better at extracting signal from well-structured prompts.`
        : `Smaller/weaker models benefit MORE from formal prompts (avg delta: small=${(avgSmallDelta >= 0 ? "+" : "") + fmtPct(avgSmallDelta)} vs large=${(avgLargeDelta >= 0 ? "+" : "") + fmtPct(avgLargeDelta)}). This suggests tone sensitivity is a compensatory mechanism -- weaker models rely more on prompt structure to guide their output, while stronger models perform well regardless of tone.`
    }`);

    // Check if any model shows negative delta (casual > formal)
    const casualWins = modelData.filter(d => d.delta < 0);
    if (casualWins.length > 0) {
      console.log();
      console.log(`Notable: ${casualWins.map(d => d.model).join(", ")} actually scored HIGHER with casual tone (negative F-C delta). This suggests the formal-is-better assumption does not hold universally.`);
    }
  }
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? NaN : num / denom;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
