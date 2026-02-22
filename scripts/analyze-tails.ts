import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JudgedEvalResult } from "../src/types.js";

function composite(r: JudgedEvalResult): number {
  const j = r.judgeScores;
  return ((j.quality + j.thoroughness + j.creativity + j.adherenceToInstructions) / 4) * 10;
}

const TONES = ["casual", "controlled", "formal"] as const;

async function main() {
  const results = JSON.parse(
    await readFile(join(process.cwd(), "results/judge-scores/combined.json"), "utf-8")
  ) as JudgedEvalResult[];

  console.log("# Tail Analysis: Do Small Mean Differences Hide Big Extreme Differences?\n");
  console.log(`Total results: ${results.length}\n`);

  // Get all composite scores by tone
  const byTone = Object.fromEntries(
    TONES.map((t) => [t, results.filter((r) => r.config.tone === t).map(composite).sort((a, b) => a - b)])
  ) as Record<string, number[]>;

  // 1. Threshold analysis: what % of results exceed various quality thresholds?
  console.log("## 1. Threshold Analysis\n");
  console.log("What percentage of results exceed each quality threshold?\n");

  const thresholds = [50, 60, 70, 75, 80, 85, 90];
  const header = ["Threshold", ...TONES.map((t) => `${t} (n=${byTone[t].length})`)];
  console.log("| " + header.join(" | ") + " |");
  console.log("| " + header.map((_, i) => i === 0 ? "---" : "---:").join(" | ") + " |");

  for (const thresh of thresholds) {
    const row = [
      `>= ${thresh}%`,
      ...TONES.map((t) => {
        const above = byTone[t].filter((s) => s >= thresh).length;
        const pct = ((above / byTone[t].length) * 100).toFixed(1);
        return `${pct}% (${above}/${byTone[t].length})`;
      }),
    ];
    console.log("| " + row.join(" | ") + " |");
  }

  // 2. Ratio analysis at the extremes
  console.log("\n## 2. Extreme Ratios\n");
  console.log("How much more likely is formal to produce excellent/poor results vs casual?\n");

  const ratioThresholds = [
    { label: "Excellent (>= 85%)", fn: (s: number) => s >= 85 },
    { label: "Good (>= 75%)", fn: (s: number) => s >= 75 },
    { label: "Below average (< 65%)", fn: (s: number) => s < 65 },
    { label: "Poor (< 55%)", fn: (s: number) => s < 55 },
  ];

  for (const { label, fn } of ratioThresholds) {
    const casualRate = byTone.casual.filter(fn).length / byTone.casual.length;
    const formalRate = byTone.formal.filter(fn).length / byTone.formal.length;
    const controlledRate = byTone.controlled.filter(fn).length / byTone.controlled.length;

    const ratio = casualRate > 0 ? formalRate / casualRate : formalRate > 0 ? Infinity : 1;

    console.log(`**${label}:**`);
    console.log(`  Casual:     ${(casualRate * 100).toFixed(1)}% (${byTone.casual.filter(fn).length}/${byTone.casual.length})`);
    console.log(`  Controlled: ${(controlledRate * 100).toFixed(1)}% (${byTone.controlled.filter(fn).length}/${byTone.controlled.length})`);
    console.log(`  Formal:     ${(formalRate * 100).toFixed(1)}% (${byTone.formal.filter(fn).length}/${byTone.formal.length})`);
    console.log(`  Formal/Casual ratio: ${ratio === Infinity ? "Inf" : ratio.toFixed(2)}x`);
    console.log();
  }

  // 3. Per-dimension tail analysis (thoroughness is the strongest signal)
  console.log("## 3. Thoroughness Tail Analysis\n");
  console.log("Thoroughness had the strongest mean effect (+3.5%). What about the tails?\n");

  const thorByTone = Object.fromEntries(
    TONES.map((t) => [
      t,
      results.filter((r) => r.config.tone === t).map((r) => r.judgeScores.thoroughness * 10).sort((a, b) => a - b),
    ])
  ) as Record<string, number[]>;

  const thorThresholds = [
    { label: "Thoroughness >= 90%", fn: (s: number) => s >= 90 },
    { label: "Thoroughness >= 80%", fn: (s: number) => s >= 80 },
    { label: "Thoroughness < 60%", fn: (s: number) => s < 60 },
    { label: "Thoroughness < 50%", fn: (s: number) => s < 50 },
  ];

  for (const { label, fn } of thorThresholds) {
    const casualRate = thorByTone.casual.filter(fn).length / thorByTone.casual.length;
    const formalRate = thorByTone.formal.filter(fn).length / thorByTone.formal.length;
    const controlledRate = thorByTone.controlled.filter(fn).length / thorByTone.controlled.length;
    const ratio = casualRate > 0 ? formalRate / casualRate : formalRate > 0 ? Infinity : 1;

    console.log(`**${label}:**`);
    console.log(`  Casual:     ${(casualRate * 100).toFixed(1)}% (${thorByTone.casual.filter(fn).length}/${thorByTone.casual.length})`);
    console.log(`  Controlled: ${(controlledRate * 100).toFixed(1)}% (${thorByTone.controlled.filter(fn).length}/${thorByTone.controlled.length})`);
    console.log(`  Formal:     ${(formalRate * 100).toFixed(1)}% (${thorByTone.formal.filter(fn).length}/${thorByTone.formal.length})`);
    console.log(`  Formal/Casual ratio: ${ratio === Infinity ? "Inf" : ratio.toFixed(2)}x`);
    console.log();
  }

  // 4. Quintile analysis
  console.log("## 4. Score Distribution by Quintile\n");
  console.log("Binning all composite scores into quintiles to see distribution shape.\n");

  const bins = [
    { label: "45-55%", lo: 45, hi: 55 },
    { label: "55-65%", lo: 55, hi: 65 },
    { label: "65-75%", lo: 65, hi: 75 },
    { label: "75-85%", lo: 75, hi: 85 },
    { label: "85-100%", lo: 85, hi: 100 },
  ];

  const binHeader = ["Bin", ...TONES];
  console.log("| " + binHeader.join(" | ") + " |");
  console.log("| " + binHeader.map((_, i) => i === 0 ? "---" : "---:" ).join(" | ") + " |");

  for (const { label, lo, hi } of bins) {
    const row = [
      label,
      ...TONES.map((t) => {
        const count = byTone[t].filter((s) => s >= lo && s < (hi === 100 ? 101 : hi)).length;
        const pct = ((count / byTone[t].length) * 100).toFixed(0);
        return `${pct}% (${count})`;
      }),
    ];
    console.log("| " + row.join(" | ") + " |");
  }

  // 5. By task — does the tail effect differ?
  console.log("\n## 5. Tail Effect by Task\n");
  console.log("Rate of producing 'excellent' (composite >= 80%) results by tone and task.\n");

  const tasks = ["copywriting", "coding", "file-sorting"] as const;
  console.log("| Task | Casual | Controlled | Formal | Formal/Casual |");
  console.log("| --- | ---: | ---: | ---: | ---: |");

  for (const task of tasks) {
    const rates = TONES.map((tone) => {
      const items = results.filter((r) => r.config.tone === tone && r.config.task === task);
      const excellent = items.filter((r) => composite(r) >= 80).length;
      return { rate: excellent / items.length, n: items.length, excellent };
    });
    const ratio = rates[0].rate > 0 ? rates[2].rate / rates[0].rate : rates[2].rate > 0 ? Infinity : 1;
    console.log(
      `| ${task} | ${(rates[0].rate * 100).toFixed(0)}% (${rates[0].excellent}/${rates[0].n}) | ${(rates[1].rate * 100).toFixed(0)}% (${rates[1].excellent}/${rates[1].n}) | ${(rates[2].rate * 100).toFixed(0)}% (${rates[2].excellent}/${rates[2].n}) | ${ratio === Infinity ? "Inf" : ratio.toFixed(2)}x |`
    );
  }

  console.log("\nRate of producing 'poor' (composite < 60%) results by tone and task.\n");
  console.log("| Task | Casual | Controlled | Formal | Formal/Casual |");
  console.log("| --- | ---: | ---: | ---: | ---: |");

  for (const task of tasks) {
    const rates = TONES.map((tone) => {
      const items = results.filter((r) => r.config.tone === tone && r.config.task === task);
      const poor = items.filter((r) => composite(r) < 60).length;
      return { rate: poor / items.length, n: items.length, poor };
    });
    const ratio = rates[0].rate > 0 ? rates[2].rate / rates[0].rate : rates[2].rate > 0 ? Infinity : 1;
    console.log(
      `| ${task} | ${(rates[0].rate * 100).toFixed(0)}% (${rates[0].poor}/${rates[0].n}) | ${(rates[1].rate * 100).toFixed(0)}% (${rates[1].poor}/${rates[1].n}) | ${(rates[2].rate * 100).toFixed(0)}% (${rates[2].poor}/${rates[2].n}) | ${ratio === Infinity ? "Inf" : ratio.toFixed(2)}x |`
    );
  }
}

main().catch(console.error);
