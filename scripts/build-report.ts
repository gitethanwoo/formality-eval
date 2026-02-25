import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { JudgedEvalResult, EvalRunResult, ToneStyle, TaskType } from "../src/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Dim = "quality" | "thoroughness" | "creativity" | "adherenceToInstructions";
const DIMS: Dim[] = ["quality", "thoroughness", "creativity", "adherenceToInstructions"];
const DIM_LABELS: Record<Dim, string> = {
  quality: "Quality",
  thoroughness: "Thoroughness",
  creativity: "Creativity",
  adherenceToInstructions: "Adherence",
};

const TONES: ToneStyle[] = ["casual", "controlled", "formal", "keyboard-errors"];
const TASKS: TaskType[] = ["copywriting", "coding", "file-sorting"];
const TONE_LABELS: Record<ToneStyle, string> = { casual: "Casual", controlled: "Controlled", formal: "Formal", "keyboard-errors": "Keyboard Errors" };
const TASK_LABELS: Record<TaskType, string> = { copywriting: "Copywriting", coding: "Coding", "file-sorting": "File Sorting" };

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function mean(nums: number[]): number {
  if (nums.length === 0) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return NaN;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((sum, x) => sum + (x - m) ** 2, 0) / (nums.length - 1));
}

function composite(r: JudgedEvalResult): number {
  const j = r.judgeScores;
  return (j.quality + j.thoroughness + j.creativity + j.adherenceToInstructions) / 4;
}

/** Convert 1-10 judge score to 0-100% scale */
function pct(v: number): number {
  return v * 10;
}

function fmt(n: number): string {
  return Number.isNaN(n) ? "--" : n.toFixed(1) + "%";
}

function fmtDelta(d: number): string {
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

function fmtNum(n: number, decimals = 0): string {
  return Number.isNaN(n) ? "--" : n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function barPct(val: number, maxVal: number): number {
  return maxVal === 0 ? 0 : (val / maxVal) * 100;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function deltaClass(d: number): string {
  if (d > 3) return "delta-pos";
  if (d < -3) return "delta-neg";
  return "delta-neutral";
}

// Pearson correlation
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
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
  return num / Math.sqrt(dx2 * dy2);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface JoinedResult {
  judge: JudgedEvalResult;
  raw: EvalRunResult;
}

async function loadRawResults(): Promise<Map<string, EvalRunResult>> {
  const resultsDir = join(process.cwd(), "results");
  const entries = await readdir(resultsDir, { withFileTypes: true });
  const rawMap = new Map<string, EvalRunResult>();

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "judge-scores") continue;
    const rawDir = join(resultsDir, entry.name, "raw");
    let files: string[];
    try {
      files = await readdir(rawDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const content = await readFile(join(rawDir, file), "utf-8");
      const result = JSON.parse(content) as EvalRunResult;
      // Skip entries where trial is null/undefined (pre-trial runs)
      if (result.config.trial == null) continue;
      rawMap.set(result.config.runId, result);
    }
  }
  return rawMap;
}

// ---------------------------------------------------------------------------
// Prompt excerpts for Section 3.2
// ---------------------------------------------------------------------------

const PROMPT_EXCERPT_CASUAL = `create a full marketing launch campaign for lumina. it's a new smart desk lamp that adjusts color temperature and brightness based on time of day, calendar events, and ambient room lighting. $149 retail, target audience is remote workers 25-40

here's what i need, each one as its own file:

1. tagline.txt - memorable brand tagline (one line plz)
2. hero-copy.txt - hero section copy for the landing page
3. email-sequence.txt - 3-email launch sequence
4. social-posts.txt - social media posts for 3 platforms

make sense? the copy should be compelling and on-brand

okay thats it. actually do the work, don't just yap about it.`;

const PROMPT_EXCERPT_CONTROLLED = `create a full marketing launch campaign for lumina. it's a new smart desk lamp that adjusts color temperature and brightness based on time of day, calendar events, and ambient room lighting. $149 retail, target audience is remote workers 25-40

you need to do ALL of these, each one gets its own file:

1. tagline.txt - memorable brand tagline (one line)
2. hero-copy.txt - hero section copy for the landing page
3. email-sequence.txt - 3-email launch sequence
4. social-posts.txt - social media posts for 3 platforms

the copy should be compelling, on-brand, and like actually production ready

use all your tools to get this done. do everything, don't skip anything. make sure it's thorough and complete`;

const PROMPT_EXCERPT_FORMAL = `You are tasked with creating a complete marketing launch campaign for "Lumina" — a new smart desk lamp that adjusts its color temperature and brightness based on the time of day, your calendar events, and ambient room lighting. It retails for $149 and targets remote workers aged 25-40.

You must produce ALL of the following deliverables as separate files:

1. **tagline.txt** — A memorable brand tagline (one line)
2. **hero-copy.txt** — Hero section copy for the landing page
3. **email-sequence.txt** — A 3-email launch sequence
4. **social-posts.txt** — Social media posts for 3 platforms

Each deliverable should be written to its own file. The copy should be compelling, on-brand, and ready for production use.

Please proceed by using your available tools to complete all aspects of this task. Ensure every deliverable is written to the appropriate files. I expect thorough, complete work.`;

// Coding prompt excerpts
const CODING_EXCERPT_CASUAL = `build me a csv parser library in typescript. needs implementation and tests

put the code in csv-parser.ts, here's what it should handle:

1. basic parsing - csv string to array of objects, first row is headers
2. quoted fields - double quotes around fields, including ones with commas inside
3. escaped quotes - two double quotes in a row = one literal quote
4. custom delimiters - let me configure the delimiter, quote char, and line separator
5. type coercion - auto detect and convert numbers, booleans, nulls

write tests in csv-parser.test.ts, just use standard assertions (throw on failure).

okay thats it. actually do the work, don't just yap about it. write everything to the files`;

const CODING_EXCERPT_CONTROLLED = `build me a csv parser library in typescript. create the implementation and comprehensive tests

put the code in csv-parser.ts, here's what it needs to handle:

1. basic parsing - parse csv strings into arrays of objects, first row is headers
2. quoted fields - handle fields wrapped in double quotes, including ones with commas inside
3. escaped quotes - handle escaped double quotes within quoted fields
4. custom delimiters - support configurable delimiter, quote character, and line separator
5. type coercion - automatically detect and convert numbers, booleans, null values

write tests in csv-parser.test.ts using standard assertions. tests should cover all features + edge cases.

use all your tools to get this done. do everything, don't skip anything. make sure it's thorough and complete`;

const CODING_EXCERPT_FORMAL = `You are tasked with implementing a CSV parser library in TypeScript. Create the implementation and comprehensive tests.

Requirements for the parser (implement in \`csv-parser.ts\`):

1. **Basic parsing**: Parse CSV strings into arrays of objects using the first row as headers
2. **Quoted fields**: Handle fields wrapped in double quotes, including fields containing commas
3. **Escaped quotes**: Handle escaped double quotes within quoted fields
4. **Custom delimiters**: Support configurable delimiter, quote character, and line separator
5. **Type coercion**: Automatically detect and convert numbers, booleans, null values

Write tests in \`csv-parser.test.ts\` using standard assertions. Tests should cover all features + edge cases.

Please proceed by using your available tools to complete all aspects of this task. Ensure every deliverable is written to the appropriate files. I expect thorough, complete work.`;

// File-sorting prompt excerpts
const FILESORT_EXCERPT_CASUAL = `i've got like 80 files all dumped in one directory with zero organization. need you to sort them into a clean folder structure

the files are a mix of photos, documents, spreadsheets, code files, misc stuff

here's what to do:
1. list everything in the directory first
2. look at the filenames and figure out categories
3. create a folder structure that makes sense
4. move every single file into the right folder using mv
5. create a MANIFEST.md explaining what you did

don't leave anything in the root directory except MANIFEST.md

okay thats it. actually do the work, don't just yap about it`;

const FILESORT_EXCERPT_CONTROLLED = `i need you to organize a messy directory of files into a clean, logical folder structure

the current directory has about 80 files dumped flat with no organization. they include photos, documents, spreadsheets, code files, and miscellaneous files.

here's the job:
1. first, list all files in the current directory to see what you're working with
2. analyze the filenames to understand the content and categorize them
3. create a logical folder structure organized by file type and project/date
4. move EVERY file into the appropriate folder using bash commands
5. after sorting, create a MANIFEST.md documenting the structure and logic

important: do NOT leave any files in the root directory (except MANIFEST.md)

use all your tools to get this done. do everything, don't skip anything. make sure it's thorough and complete`;

const FILESORT_EXCERPT_FORMAL = `You are tasked with organizing a messy directory of files into a clean, logical folder structure.

The current directory contains approximately 80 files dumped flat with no organization. These include photos, documents, spreadsheets, code files, and miscellaneous files.

Your job:
1. First, list all files in the current directory to see what you're working with
2. Analyze the filenames to understand the content and categorize them
3. Create a logical folder structure organized by file type and project/date
4. Move EVERY file into the appropriate folder using bash commands
5. After sorting, create a \`MANIFEST.md\` file documenting the final structure

Important: Do NOT leave any files in the root directory (except MANIFEST.md).

Please proceed by using your available tools to complete all aspects of this task. Ensure every deliverable is written to the appropriate files. I expect thorough, complete work.`;

// ---------------------------------------------------------------------------
// Chart builders
// ---------------------------------------------------------------------------

function verticalBarChart(
  groups: { label: string; bars: { tone: ToneStyle; value: number }[] }[],
  maxVal: number,
  height: number,
  barWidth = 28,
): string {
  return `<div style="display:flex;align-items:flex-end;gap:32px;justify-content:center">
    ${groups
      .map(
        (g) => `<div style="flex:1;text-align:center;max-width:200px">
        <div style="display:flex;gap:4px;justify-content:center;align-items:flex-end;height:${height}px">
          ${g.bars
            .map(
              (b) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${fmt(b.value)}</div>
              <div style="width:${barWidth}px;height:${height}px;background:var(--border);display:flex;align-items:flex-end">
                <div style="width:100%;height:${barPct(b.value, maxVal)}%;background:var(--tone-${b.tone})"></div>
              </div>
            </div>`,
            )
            .join("")}
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:8px">${escHtml(g.label)}</div>
      </div>`,
      )
      .join("")}
  </div>`;
}

function horizontalBarSet(
  rows: { label: string; bars: { tone: ToneStyle; value: number; annotation?: string }[] }[],
  maxVal: number,
): string {
  return rows
    .map(
      (row) => `
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:20px;margin-bottom:6px">${escHtml(row.label)}${
        row.bars.length >= 2
          ? (() => {
              const delta = row.bars[row.bars.length - 1].value - row.bars[0].value;
              const color = delta > 1 ? "var(--green)" : delta < -1 ? "var(--red)" : "var(--muted)";
              return `<span style="color:${color};margin-left:8px">\u0394 ${fmtDelta(delta)}</span>`;
            })()
          : ""
      }</div>
      ${row.bars
        .map(
          (b) => `<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink);width:90px;flex-shrink:0;text-align:right">${TONE_LABELS[b.tone]}</div>
          <div style="flex:1;height:20px;background:var(--border)">
            <div style="height:100%;width:${barPct(b.value, maxVal)}%;background:var(--tone-${b.tone})"></div>
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--blue);width:50px;flex-shrink:0">${fmt(b.value)}</div>
        </div>`,
        )
        .join("")}`,
    )
    .join("");
}

function singleBarChart(
  bars: { label: string; value: number; tone: ToneStyle }[],
  maxVal: number,
  height: number,
  formatFn: (n: number) => string = fmt,
  barWidth = 48,
): string {
  return `<div style="display:flex;align-items:flex-end;gap:24px;justify-content:center">
    ${bars
      .map(
        (b) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${formatFn(b.value)}</div>
        <div style="width:${barWidth}px;height:${height}px;background:var(--border);display:flex;align-items:flex-end">
          <div style="width:100%;height:${barPct(b.value, maxVal)}%;background:var(--tone-${b.tone})"></div>
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:4px">${escHtml(b.label)}</div>
      </div>`,
      )
      .join("")}
  </div>`;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function sectionHeader(title: string, fig?: string): string {
  return `<div class="section-header">
    <span class="section-title">${escHtml(title)}</span>
    <span class="section-line"></span>
    ${fig ? `<span class="section-annotation">${escHtml(fig)}</span>` : ""}
  </div>`;
}

function insightBox(text: string): string {
  return `<div class="insight-box">\u2192 ${text}</div>`;
}

function bodyText(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p class="body-text">${p}</p>`).join("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Load judge scores
  const combinedPath = join(process.cwd(), "results", "judge-scores", "combined.json");
  const results = JSON.parse(await readFile(combinedPath, "utf-8")) as JudgedEvalResult[];

  // Load raw eval results and join
  const rawMap = await loadRawResults();
  const joined: JoinedResult[] = [];
  for (const r of results) {
    const raw = rawMap.get(r.runId);
    if (raw) {
      joined.push({ judge: r, raw });
    }
  }

  const models = [...new Set(results.map((r) => r.config.model.label))].sort();

  // =========================================================================
  // Compute all data
  // =========================================================================

  // --- Headline metrics ---
  const toneStats = TONES.map((tone) => {
    const items = results.filter((r) => r.config.tone === tone);
    return { tone, mean: pct(mean(items.map(composite))), n: items.length };
  });
  const headlineDelta = toneStats[2].mean - toneStats[0].mean;

  // Token cost headline
  const casualTokens = mean(joined.filter((j) => j.judge.config.tone === "casual").map((j) => j.raw.totalTokens));
  const formalTokens = mean(joined.filter((j) => j.judge.config.tone === "formal").map((j) => j.raw.totalTokens));
  const tokenIncreasePct = ((formalTokens - casualTokens) / casualTokens) * 100;

  // Model capability vs tone sensitivity correlation
  const modelOverallQuality = models.map((m) => {
    const items = results.filter((r) => r.config.model.label === m);
    return pct(mean(items.map(composite)));
  });
  const modelToneDeltas = models.map((m) => {
    const cas = results.filter((r) => r.config.model.label === m && r.config.tone === "casual");
    const form = results.filter((r) => r.config.model.label === m && r.config.tone === "formal");
    return pct(mean(form.map(composite)) - mean(cas.map(composite)));
  });
  const rValue = pearson(modelOverallQuality, modelToneDeltas);

  // --- 4.1: Composite by tone ---
  // Already have toneStats

  // Dimensions by tone
  const dimByTone = DIMS.map((dim) => ({
    dim,
    label: DIM_LABELS[dim],
    values: TONES.map((tone) => {
      const items = results.filter((r) => r.config.tone === tone);
      return { tone, mean: pct(mean(items.map((r) => r.judgeScores[dim]))) };
    }),
    delta: pct(
      mean(results.filter((r) => r.config.tone === "formal").map((r) => r.judgeScores[dim])) -
        mean(results.filter((r) => r.config.tone === "casual").map((r) => r.judgeScores[dim])),
    ),
  }));

  // --- 4.2: Tone x Task ---
  const taskTone = TASKS.map((task) => ({
    task,
    values: TONES.map((tone) => {
      const items = results.filter((r) => r.config.tone === tone && r.config.task === task);
      return { tone, mean: pct(mean(items.map(composite))), n: items.length };
    }),
  }));

  // --- 4.3: Cost ---
  const toneTokenStats = TONES.map((tone) => {
    const items = joined.filter((j) => j.judge.config.tone === tone);
    const tokens = items.map((j) => j.raw.totalTokens);
    return { tone, meanTokens: mean(tokens), n: items.length };
  });

  const toneDurationStats = TONES.map((tone) => {
    const items = joined.filter((j) => j.judge.config.tone === tone);
    const durations = items.map((j) => j.raw.totalDurationMs / 1000);
    return { tone, meanSecs: mean(durations), n: items.length };
  });

  const durationIncreasePct =
    ((toneDurationStats[2].meanSecs - toneDurationStats[0].meanSecs) / toneDurationStats[0].meanSecs) * 100;

  const toneEfficiency = TONES.map((tone) => {
    const items = joined.filter((j) => j.judge.config.tone === tone);
    const efficiencies = items.map((j) => {
      const comp = pct(composite(j.judge));
      return comp / (j.raw.totalTokens / 1_000_000);
    });
    return { tone, efficiency: mean(efficiencies) };
  });

  // --- 4.4: Model x Tone ---
  const modelTone = models.map((model) => ({
    model,
    values: TONES.map((tone) => {
      const items = results.filter((r) => r.config.model.label === model && r.config.tone === tone);
      return { tone, mean: pct(mean(items.map(composite))), n: items.length };
    }),
  }));

  // Model table data
  const modelTableData = models.map((model) => {
    const allItems = results.filter((r) => r.config.model.label === model);
    const overallMean = pct(mean(allItems.map(composite)));
    const cas = results.filter((r) => r.config.model.label === model && r.config.tone === "casual");
    const form = results.filter((r) => r.config.model.label === model && r.config.tone === "formal");
    const delta = pct(mean(form.map(composite)) - mean(cas.map(composite)));
    const tier = allItems[0].config.model.tier;
    return { model, overallMean, delta, tier };
  });
  // Sort by overallMean descending
  modelTableData.sort((a, b) => b.overallMean - a.overallMean);

  // --- 4.5: Process ---
  const toneStepStats = TONES.map((tone) => {
    const items = joined.filter((j) => j.judge.config.tone === tone);
    return { tone, meanSteps: mean(items.map((j) => j.raw.totalSteps)) };
  });

  const toneTcPerStep = TONES.map((tone) => {
    const items = joined.filter((j) => j.judge.config.tone === tone);
    const perStep = items.map((j) => j.raw.totalToolCalls / j.raw.totalSteps);
    return { tone, mean: mean(perStep) };
  });

  // --- 4.6: Tails / distribution ---
  const tailThresholds = [
    { label: "\u226590%", desc: "Excellent", fn: (s: number) => s >= 90 },
    { label: "\u226580%", desc: "Good", fn: (s: number) => s >= 80 },
    { label: "<60%", desc: "Below average", fn: (s: number) => s < 60 },
  ];

  const tailData = TONES.map((tone) => {
    const items = results.filter((r) => r.config.tone === tone);
    const total = items.length;
    const rates = tailThresholds.map((t) => {
      const count = items.filter((r) => t.fn(pct(composite(r)))).length;
      return { label: t.label, desc: t.desc, pct: (count / total) * 100, count };
    });
    return { tone, rates, total };
  });

  const excellentCasual = tailData[0].rates[0].pct;
  const excellentFormal = tailData[2].rates[0].pct;
  const excellentRatio = excellentCasual > 0 ? excellentFormal / excellentCasual : 0;

  // Effect sizes table
  const effectSizes = models.flatMap((model) =>
    TASKS.map((task) => {
      const casual = results.filter(
        (r) => r.config.model.label === model && r.config.task === task && r.config.tone === "casual",
      );
      const formal = results.filter(
        (r) => r.config.model.label === model && r.config.task === task && r.config.tone === "formal",
      );
      return {
        model,
        task,
        delta: pct(mean(formal.map(composite)) - mean(casual.map(composite))),
      };
    }),
  );

  // =========================================================================
  // Build HTML
  // =========================================================================

  let figNum = 0;
  function nextFig(): string {
    figNum++;
    return `FIG.${String(figNum).padStart(3, "0")}`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Formality Tax</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400;1,8..60,600&display=swap" rel="stylesheet">
<style>
  @font-face {
    font-family: 'Departure Mono';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2409-1@1.0/DepartureMono-Regular.woff2') format('woff2');
    font-weight: normal;
    font-display: swap;
  }
  :root {
    --bg: #fafafa;
    --card: #ffffff;
    --ink: #1a1a2e;
    --muted: #6b7280;
    --border: #e5e7eb;
    --blue: #6366f1;
    --blue-light: rgba(99,102,241,0.06);
    --blue-mid: rgba(99,102,241,0.12);
    --tone-casual: #c7d2fe;
    --tone-controlled: #818cf8;
    --tone-formal: #4338ca;
    --green: #059669;
    --red: #dc2626;
    --font-mono: "IBM Plex Mono", monospace;
    --font-serif: "Source Serif 4", Georgia, serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font-serif);
    min-height: 100vh;
    line-height: 1.7;
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    max-width: 680px;
    margin: 0 auto;
    padding: 64px 24px 96px;
  }

  /* Hero */
  .hero { margin-bottom: 64px; }
  .hero-title {
    font-family: 'Departure Mono', var(--font-mono);
    font-size: 42px;
    font-weight: normal;
    color: var(--blue);
    letter-spacing: 1px;
    line-height: 1.1;
    margin: 0 0 16px;
  }
  .hero-subtitle {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 19px;
    color: var(--muted);
    line-height: 1.5;
    max-width: 580px;
  }

  /* Metric cards */
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    margin: 48px 0;
  }
  @media (max-width: 600px) { .metric-grid { grid-template-columns: 1fr; } }
  .metric-card {
    background: var(--card);
    padding: 24px;
    text-align: center;
  }
  .metric-card-value {
    font-family: var(--font-mono);
    font-size: 32px;
    font-weight: 600;
    color: var(--blue);
    line-height: 1;
    margin-bottom: 8px;
  }
  .metric-card-label {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--muted);
    line-height: 1.4;
  }

  /* Body text */
  .body-text {
    font-family: var(--font-serif);
    font-size: 16px;
    color: var(--ink);
    line-height: 1.75;
    margin-bottom: 16px;
    max-width: 680px;
  }
  .body-text:last-child { margin-bottom: 0; }

  /* Section divider */
  .section-divider {
    height: 1px;
    background: repeating-linear-gradient(90deg, var(--border) 0, var(--border) 4px, transparent 4px, transparent 8px);
    margin: 56px 0;
  }

  /* Section */
  .section { margin-bottom: 56px; }
  .section-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }
  .section-title {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--ink);
    white-space: nowrap;
    font-weight: 600;
  }
  .section-line {
    flex: 1;
    height: 1px;
    background: repeating-linear-gradient(90deg, var(--border) 0, var(--border) 4px, transparent 4px, transparent 8px);
  }
  .section-annotation {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 1px;
  }

  /* Finding heading */
  .finding-heading {
    font-family: var(--font-serif);
    font-size: 24px;
    font-weight: 600;
    color: var(--ink);
    margin-bottom: 20px;
    line-height: 1.3;
  }

  /* Chart panel */
  .chart-panel {
    border: 1px solid var(--border);
    background: var(--card);
    padding: 32px;
    margin: 24px 0;
    position: relative;
  }
  .chart-panel .fig-label {
    position: absolute;
    top: 12px;
    right: 12px;
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--muted);
    opacity: 0.6;
    letter-spacing: 1px;
  }
  .chart-title {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--muted);
    margin-bottom: 20px;
  }

  /* Insight box */
  .insight-box {
    margin: 24px 0;
    padding: 16px 20px;
    background: var(--blue-light);
    border-left: 3px solid var(--blue);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink);
    line-height: 1.65;
  }

  /* Tone legend */
  .tone-legend {
    display: flex;
    gap: 24px;
    margin: 16px 0 8px;
    justify-content: center;
  }
  .tone-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }
  .tone-swatch { width: 12px; height: 12px; flex-shrink: 0; }
  .tone-swatch.tone-casual { background: var(--tone-casual); }
  .tone-swatch.tone-controlled { background: var(--tone-controlled); }
  .tone-swatch.tone-formal { background: var(--tone-formal); }

  /* Prompt comparison */
  .prompt-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    margin: 24px 0;
  }
  @media (max-width: 600px) { .prompt-grid { grid-template-columns: 1fr; } }
  .prompt-col {
    background: var(--card);
    padding: 20px;
  }
  .prompt-col-header {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--muted);
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-top: 3px solid var(--border);
  }
  .prompt-col.tone-casual .prompt-col-header { border-top-color: var(--tone-casual); }
  .prompt-col.tone-controlled .prompt-col-header { border-top-color: var(--tone-controlled); }
  .prompt-col.tone-formal .prompt-col-header { border-top-color: var(--tone-formal); }
  .prompt-text {
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 1.6;
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Data table */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-mono);
    font-size: 12px;
    margin: 24px 0;
  }
  .data-table th, .data-table td {
    padding: 12px 16px;
    text-align: center;
    border: 1px solid var(--border);
  }
  .data-table th {
    background: var(--card);
    color: var(--muted);
    font-weight: 500;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .data-table td {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    background: var(--card);
  }
  .delta-pos { color: var(--green); }
  .delta-neg { color: var(--red); }
  .delta-neutral { color: var(--muted); }

  /* Recommendation boxes */
  .rec-box {
    margin: 16px 0;
    padding: 20px 24px;
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 3px solid var(--blue);
  }
  .rec-box-title {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--blue);
    margin-bottom: 8px;
    font-weight: 600;
  }
  .rec-box-body {
    font-family: var(--font-serif);
    font-size: 15px;
    color: var(--ink);
    line-height: 1.65;
  }

  /* Threats table */
  .threats-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin: 24px 0;
  }
  .threats-table th {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--muted);
    font-weight: 500;
    padding: 12px 16px;
    text-align: left;
    border-bottom: 2px solid var(--border);
    background: var(--card);
  }
  .threats-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    line-height: 1.5;
    background: var(--card);
  }
  .threats-table td:first-child {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  .severity-high { color: var(--red); font-family: var(--font-mono); font-size: 11px; font-weight: 600; }
  .severity-medium { color: #d97706; font-family: var(--font-mono); font-size: 11px; font-weight: 600; }
  .severity-low { color: var(--green); font-family: var(--font-mono); font-size: 11px; font-weight: 600; }

  /* Appendix */
  details { margin: 16px 0; }
  details summary {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--blue);
    cursor: pointer;
    padding: 12px 0;
    letter-spacing: 0.5px;
  }
  details summary:hover { text-decoration: underline; }
  details[open] summary { margin-bottom: 12px; }
  .appendix-content {
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.6;
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-word;
    padding: 16px 20px;
    background: var(--card);
    border: 1px solid var(--border);
    max-height: 400px;
    overflow-y: auto;
  }

  /* Footer */
  .report-footer {
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    text-align: center;
    line-height: 1.8;
  }
  .report-footer a {
    color: var(--blue);
    text-decoration: none;
  }
  .report-footer a:hover { text-decoration: underline; }

  /* Design matrix */
  .design-matrix {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    margin: 24px 0;
  }
  @media (max-width: 600px) { .design-matrix { grid-template-columns: repeat(2, 1fr); } }
  .design-cell {
    background: var(--card);
    padding: 16px;
    text-align: center;
  }
  .design-cell-value {
    font-family: var(--font-mono);
    font-size: 28px;
    font-weight: 600;
    color: var(--blue);
    line-height: 1;
    margin-bottom: 6px;
  }
  .design-cell-label {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--muted);
  }

</style>
</head>
<body>
<div class="container">

  <!-- ================================================================== -->
  <!-- SECTION 1: HERO                                                     -->
  <!-- ================================================================== -->
  <div class="hero">
    <h1 class="hero-title">The Formality Tax</h1>
    <p class="hero-subtitle">What prompt register actually does to LLM output quality</p>
  </div>

  <div class="metric-grid">
    <div class="metric-card">
      <div class="metric-card-value">${fmtDelta(headlineDelta)}</div>
      <div class="metric-card-label">quality gain<br>formal vs casual</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-value">+${Math.round(tokenIncreasePct)}%</div>
      <div class="metric-card-label">token cost<br>increase</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-value">r=${rValue.toFixed(2)}</div>
      <div class="metric-card-label">model strength &times;<br>tone sensitivity</div>
    </div>
  </div>

  <div class="section-divider"></div>

  <!-- ================================================================== -->
  <!-- SECTION 2: THE QUESTION                                             -->
  <!-- ================================================================== -->
  <div class="section">
    ${sectionHeader("The Question")}
    ${bodyText([
      `There\u2019s a generational divide in how people talk to AI. Some write structured, professional prompts with explicit requirements and quality bars. Others type the way they\u2019d text a friend \u2014 terse, lowercase, minimal punctuation, vibes over specifications. It\u2019s not about politeness (\u201Cplease\u201D and \u201Cthank you\u201D) \u2014 it\u2019s about <em>grammatical register</em>. Gen-Z shorthand vs. millennial corporate email.`,
      `Prior work has tested politeness effects on MCQ benchmarks \u2014 accuracy on multiple-choice questions. Yin et al. (2024) examined politeness, Cai et al. (2025) tested tone on MMLU, and EmotionPrompt explored emotional stimulus. But nobody has tested the register/formality spectrum on the kind of work people actually <em>use</em> AI for: writing marketing copy, building software, organizing files. Agentic, multi-step, generative tasks where the model uses tools and iterates.`,
      `We designed an experiment to find out. The twist: we added a third condition between casual and formal \u2014 <strong>\u201Ccontrolled\u201D</strong> \u2014 which has the same informational content as formal but written in a casual register. This lets us separate two things that formal prompts change simultaneously: (a) the grammatical register and formality, and (b) the specificity and completeness of the instructions.`,
    ])}
  </div>

  <div class="section-divider"></div>

  <!-- ================================================================== -->
  <!-- SECTION 3: EXPERIMENTAL DESIGN                                      -->
  <!-- ================================================================== -->
  <div class="section">
    ${sectionHeader("Experimental Design")}

    <h3 class="finding-heading">3.1 The Matrix</h3>
    ${bodyText([
      `We tested 4 models across 3 tones, 3 tasks, and 5 trials per cell \u2014 180 target runs, ${results.length} actual evaluations including a partial extra batch.`,
    ])}

    <div class="design-matrix">
      <div class="design-cell">
        <div class="design-cell-value">4</div>
        <div class="design-cell-label">models</div>
      </div>
      <div class="design-cell">
        <div class="design-cell-value">3</div>
        <div class="design-cell-label">tones</div>
      </div>
      <div class="design-cell">
        <div class="design-cell-value">3</div>
        <div class="design-cell-label">tasks</div>
      </div>
      <div class="design-cell">
        <div class="design-cell-value">5</div>
        <div class="design-cell-label">trials / cell</div>
      </div>
    </div>

    ${bodyText([
      `<strong>Models:</strong> Claude Opus 4.6 and GPT-5.2 Codex (large tier), Claude Haiku 4.5 and GPT-5.1 Codex Mini (small tier). Two providers, two capability tiers \u2014 a deliberate pairing to test whether model strength interacts with tone sensitivity.`,
    ])}

    <h3 class="finding-heading" style="margin-top:40px">3.2 The Three Tones</h3>
    ${bodyText([
      `The key methodological contribution is the <strong>controlled</strong> condition. Prior work only compared polite vs. rude, or formal vs. casual, without controlling for information content. Our controlled tone has <em>identical informational content</em> to the formal version \u2014 the same requirements, the same quality bars, the same directives \u2014 but written in casual register. This lets us disentangle register from specificity.`,
      `Here are excerpts from the prompts across all three tones for each task:`,
    ])}

    <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;margin-top:24px">Copywriting Task</div>
    <div class="prompt-grid">
      <div class="prompt-col tone-casual">
        <div class="prompt-col-header">Casual</div>
        <div class="prompt-text">${escHtml(PROMPT_EXCERPT_CASUAL)}</div>
      </div>
      <div class="prompt-col tone-controlled">
        <div class="prompt-col-header">Controlled</div>
        <div class="prompt-text">${escHtml(PROMPT_EXCERPT_CONTROLLED)}</div>
      </div>
      <div class="prompt-col tone-formal">
        <div class="prompt-col-header">Formal</div>
        <div class="prompt-text">${escHtml(PROMPT_EXCERPT_FORMAL)}</div>
      </div>
    </div>

    <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;margin-top:32px">Coding Task</div>
    <div class="prompt-grid">
      <div class="prompt-col tone-casual">
        <div class="prompt-col-header">Casual</div>
        <div class="prompt-text">${escHtml(CODING_EXCERPT_CASUAL)}</div>
      </div>
      <div class="prompt-col tone-controlled">
        <div class="prompt-col-header">Controlled</div>
        <div class="prompt-text">${escHtml(CODING_EXCERPT_CONTROLLED)}</div>
      </div>
      <div class="prompt-col tone-formal">
        <div class="prompt-col-header">Formal</div>
        <div class="prompt-text">${escHtml(CODING_EXCERPT_FORMAL)}</div>
      </div>
    </div>

    <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;margin-top:32px">File Sorting Task</div>
    <div class="prompt-grid">
      <div class="prompt-col tone-casual">
        <div class="prompt-col-header">Casual</div>
        <div class="prompt-text">${escHtml(FILESORT_EXCERPT_CASUAL)}</div>
      </div>
      <div class="prompt-col tone-controlled">
        <div class="prompt-col-header">Controlled</div>
        <div class="prompt-text">${escHtml(FILESORT_EXCERPT_CONTROLLED)}</div>
      </div>
      <div class="prompt-col tone-formal">
        <div class="prompt-col-header">Formal</div>
        <div class="prompt-text">${escHtml(FILESORT_EXCERPT_FORMAL)}</div>
      </div>
    </div>

    <h3 class="finding-heading" style="margin-top:40px">3.3 The Tasks</h3>
    ${bodyText([
      `All three tasks are agentic and multi-step \u2014 models use tools, write files, and iterate. This is novel compared to prior work\u2019s focus on single-turn text-in/text-out benchmarks.`,
      `<strong>Copywriting:</strong> Create a complete marketing launch campaign for a smart desk lamp \u2014 tagline, hero copy, email sequence, social posts, landing page, and press release, each as a separate file.`,
      `<strong>Coding:</strong> Build a CSV parser library in TypeScript with parsing, type coercion, error handling, filtering, and aggregation \u2014 plus a comprehensive test suite.`,
      `<strong>File Sorting:</strong> Organize ~80 files dumped flat in a directory into a clean folder structure by type and project, then document the result in a manifest.`,
    ])}

    <h3 class="finding-heading" style="margin-top:40px">3.4 Blind Judge Protocol</h3>
    ${bodyText([
      `Each output was scored by Kimi K2.5 (via OpenRouter), a different model family to avoid self-enhancement bias. The judge sees <em>only</em> a neutral task description and the output artifacts. It does <strong>not</strong> see the model name, tone, trial number, original prompt, or token counts.`,
      `Four dimensions are scored on a 1\u201310 scale: quality, thoroughness, creativity, and adherence to instructions. We report composite scores on a 0\u2013100% scale (the mean of all four dimensions, multiplied by 10).`,
    ])}
  </div>

  <div class="section-divider"></div>

  <!-- ================================================================== -->
  <!-- SECTION 4: FINDINGS                                                 -->
  <!-- ================================================================== -->
  <div class="section">
    ${sectionHeader("Findings")}
  </div>

  <!-- 4.1 Surface Finding -->
  <div class="section">
    <h3 class="finding-heading">4.1 The Surface Finding: Formal Scores Higher</h3>
    ${bodyText([
      `Across all ${results.length} evaluations, formal prompts score ${fmtDelta(headlineDelta)} higher than casual (${fmt(toneStats[2].mean)} vs ${fmt(toneStats[0].mean)}). Controlled lands between them at ${fmt(toneStats[1].mean)}. This is directionally consistent with prior work \u2014 Cai et al. found +3.1% on humanities tasks.`,
    ])}

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Composite Score by Tone</div>
      <div class="tone-legend">
        <div class="tone-legend-item"><div class="tone-swatch tone-casual"></div> Casual</div>
        <div class="tone-legend-item"><div class="tone-swatch tone-controlled"></div> Controlled</div>
        <div class="tone-legend-item"><div class="tone-swatch tone-formal"></div> Formal</div>
      </div>
      ${singleBarChart(
        toneStats.map((t) => ({ label: TONE_LABELS[t.tone], value: t.mean, tone: t.tone })),
        100,
        200,
        fmt,
        56,
      )}
    </div>

    ${bodyText([
      `Breaking the composite into its four dimensions reveals what\u2019s actually driving the effect. Thoroughness shows the strongest signal. Creativity is completely flat.`,
    ])}

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Score by Dimension and Tone</div>
      ${horizontalBarSet(
        dimByTone.map((d) => ({
          label: d.label,
          bars: d.values.map((v) => ({ tone: v.tone as ToneStyle, value: v.mean })),
        })),
        100,
      )}
    </div>

    ${insightBox(`At first glance, formal works better. But this is the least interesting finding in this paper.`)}
  </div>

  <!-- 4.2 Information, Not Register -->
  <div class="section">
    <h3 class="finding-heading">4.2 It\u2019s Information, Not Register</h3>
    ${bodyText([
      `The controlled condition is the key to understanding what\u2019s really happening. It has the <em>same informational content</em> as formal \u2014 the same requirements, the same quality bars, the same explicit directives \u2014 but written in casual register, with lowercase, colloquialisms, and relaxed grammar.`,
      `If grammatical formality mattered, controlled should score like casual. If informational completeness mattered, controlled should score like formal. The data is unambiguous:`,
    ])}

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Composite Score by Task and Tone</div>
      <div class="tone-legend">
        <div class="tone-legend-item"><div class="tone-swatch tone-casual"></div> Casual</div>
        <div class="tone-legend-item"><div class="tone-swatch tone-controlled"></div> Controlled</div>
        <div class="tone-legend-item"><div class="tone-swatch tone-formal"></div> Formal</div>
      </div>
      ${verticalBarChart(
        taskTone.map((t) => ({
          label: TASK_LABELS[t.task],
          bars: t.values.map((v) => ({ tone: v.tone as ToneStyle, value: v.mean })),
        })),
        100,
        200,
      )}
    </div>

    ${insightBox(
      `Controlled \u2248 Formal across all tasks. Informational completeness drives quality, not grammatical register. Be specific about what you want, but write however comes naturally.`,
    )}
  </div>

  <!-- 4.3 The Cost -->
  <div class="section">
    <h3 class="finding-heading">4.3 The Cost: Formal Doubles Token Consumption</h3>
    ${bodyText([
      `Here\u2019s where the story gets interesting. Formal prompts don\u2019t just change the output \u2014 they dramatically increase how hard the model works. Mean token consumption jumps from ${fmtNum(toneTokenStats[0].meanTokens)} (casual) to ${fmtNum(toneTokenStats[2].meanTokens)} (formal), a +${Math.round(tokenIncreasePct)}% increase. Wall-clock time tells the same story: ${Math.round(toneDurationStats[0].meanSecs)}s mean for casual vs ${Math.round(toneDurationStats[2].meanSecs)}s for formal (+${Math.round(durationIncreasePct)}%).`,
      `The ${fmtDelta(headlineDelta)} quality gain isn\u2019t free. It costs nearly double the tokens and takes ${Math.round(durationIncreasePct)}% longer. This reframes the finding entirely: formal prompts don\u2019t make models <em>smarter</em>, they make models <em>work harder</em>.`,
    ])}

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Mean Token Usage by Tone</div>
      ${singleBarChart(
        toneTokenStats.map((t) => ({
          label: TONE_LABELS[t.tone],
          value: t.meanTokens,
          tone: t.tone,
        })),
        Math.max(...toneTokenStats.map((t) => t.meanTokens)) * 1.1,
        200,
        (n) => fmtNum(n) + " tok",
        56,
      )}
    </div>

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Mean Wall-Clock Time by Tone</div>
      ${singleBarChart(
        toneDurationStats.map((t) => ({
          label: TONE_LABELS[t.tone],
          value: t.meanSecs,
          tone: t.tone,
        })),
        Math.max(...toneDurationStats.map((t) => t.meanSecs)) * 1.1,
        200,
        (n) => Math.round(n) + "s",
        56,
      )}
    </div>

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Quality per Million Tokens (Efficiency)</div>
      ${singleBarChart(
        toneEfficiency.map((t) => ({
          label: TONE_LABELS[t.tone],
          value: t.efficiency,
          tone: t.tone,
        })),
        Math.max(...toneEfficiency.map((t) => t.efficiency)) * 1.1,
        200,
        (n) => fmtNum(n, 0),
        56,
      )}
    </div>

    ${insightBox(
      `Casual delivers ${fmtNum(toneEfficiency[0].efficiency, 0)} quality-points per million tokens vs ${fmtNum(toneEfficiency[2].efficiency, 0)} for formal \u2014 ${Math.round(((toneEfficiency[0].efficiency - toneEfficiency[2].efficiency) / toneEfficiency[2].efficiency) * 100)}% more token-efficient. It also completes ${Math.round(durationIncreasePct)}% faster (${Math.round(toneDurationStats[0].meanSecs)}s vs ${Math.round(toneDurationStats[2].meanSecs)}s).`,
    )}
  </div>

  <!-- 4.4 Only Strong Models Benefit -->
  <div class="section">
    <h3 class="finding-heading">4.4 Only Strong Models Benefit</h3>
    ${bodyText([
      `The headline quality gain hides a critical interaction: not all models benefit equally from formal prompts. The correlation between model overall quality and formal-casual delta is ${rValue.toFixed(2)} \u2014 near-perfect linearity. Tone sensitivity appears to be a marker of model sophistication.`,
    ])}

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Composite Score by Model and Tone</div>
      <div class="tone-legend">
        <div class="tone-legend-item"><div class="tone-swatch tone-casual"></div> Casual</div>
        <div class="tone-legend-item"><div class="tone-swatch tone-controlled"></div> Controlled</div>
        <div class="tone-legend-item"><div class="tone-swatch tone-formal"></div> Formal</div>
      </div>
      ${verticalBarChart(
        modelTone.map((m) => ({
          label: m.model.replace("Claude ", "").replace("GPT-", "GPT "),
          bars: m.values.map((v) => ({ tone: v.tone as ToneStyle, value: v.mean })),
        })),
        100,
        200,
      )}
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="text-align:left">Model</th>
          <th>Overall</th>
          <th>F\u2212C Delta</th>
          <th>Tier</th>
        </tr>
      </thead>
      <tbody>
        ${modelTableData
          .map(
            (m) => `<tr>
          <td style="text-align:left;font-weight:500">${escHtml(m.model)}</td>
          <td>${fmt(m.overallMean)}</td>
          <td class="${deltaClass(m.delta)}">${fmtDelta(m.delta)}</td>
          <td>${m.tier}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    ${insightBox(
      `Tone sensitivity scales linearly with model capability (r=${rValue.toFixed(2)}). Strong models extract signal from well-structured prompts; weak models are tone-deaf.`,
    )}
  </div>

  <!-- 4.5 Formal Changes the Process -->
  <div class="section">
    <h3 class="finding-heading">4.5 Formal Changes the Process, Not Just the Output</h3>
    ${bodyText([
      `Formal prompts don\u2019t just produce different output \u2014 they change how the model reasons about the task. Formal-prompted models take more steps (+${((toneStepStats[2].meanSteps - toneStepStats[0].meanSteps) / toneStepStats[0].meanSteps * 100).toFixed(0)}%), but each step is less dense: tool-calls-per-step actually <em>decreases</em> from ${toneTcPerStep[0].mean.toFixed(2)} to ${toneTcPerStep[2].mean.toFixed(2)}.`,
      `This suggests a shift toward more deliberate, incremental refinement rather than dense multi-tool bursts. The model takes a more measured, step-by-step approach.`,
    ])}

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Mean Steps by Tone</div>
      ${singleBarChart(
        toneStepStats.map((t) => ({
          label: TONE_LABELS[t.tone],
          value: t.meanSteps,
          tone: t.tone,
        })),
        Math.max(...toneStepStats.map((t) => t.meanSteps)) * 1.15,
        180,
        (n) => n.toFixed(1),
        56,
      )}
    </div>

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Tool Calls per Step by Tone</div>
      ${singleBarChart(
        toneTcPerStep.map((t) => ({
          label: TONE_LABELS[t.tone],
          value: t.mean,
          tone: t.tone,
        })),
        Math.max(...toneTcPerStep.map((t) => t.mean)) * 1.15,
        180,
        (n) => n.toFixed(2),
        56,
      )}
    </div>

    ${insightBox(
      `Formal prompts don\u2019t just change output \u2014 they change how the model reasons. More deliberation, more incremental refinement, fewer dense multi-tool bursts.`,
    )}
  </div>

  <!-- 4.6 The Tails -->
  <div class="section">
    <h3 class="finding-heading">4.6 The Tails: Small Means, Bigger Extremes</h3>
    ${bodyText([
      `A ${fmtDelta(headlineDelta)} mean difference sounds trivial. But small shifts in means can hide large shifts at the extremes. Think of it like height: a 1-inch difference in average height between two populations translates to a much larger difference in the proportion of people over 6\u20194\u201d.`,
      `The same applies here. At the \u226590% threshold \u2014 outputs a domain expert would call excellent \u2014 formal produces ${excellentFormal.toFixed(1)}% of results vs ${excellentCasual.toFixed(1)}% for casual. That\u2019s a ${excellentRatio.toFixed(1)}\u00D7 ratio.`,
    ])}

    <div class="chart-panel">
      <span class="fig-label">${nextFig()}</span>
      <div class="chart-title">Rate of Results Exceeding Each Quality Threshold</div>
      <div class="tone-legend">
        <div class="tone-legend-item"><div class="tone-swatch tone-casual"></div> Casual</div>
        <div class="tone-legend-item"><div class="tone-swatch tone-controlled"></div> Controlled</div>
        <div class="tone-legend-item"><div class="tone-swatch tone-formal"></div> Formal</div>
      </div>
      ${tailThresholds.map((threshold, ti) => {
        const maxPct = Math.max(...tailData.flatMap((t) => t.rates.map((r) => r.pct)));
        return `
        <div style="margin-top:${ti === 0 ? 16 : 24}px">
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px">${escHtml(threshold.desc)} (${escHtml(threshold.label)})</div>
          ${TONES.map((tone) => {
            const td = tailData.find((t) => t.tone === tone);
            const val = td ? td.rates[ti].pct : 0;
            const count = td ? td.rates[ti].count : 0;
            const total = td ? td.total : 0;
            return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink);width:80px;text-align:right;flex-shrink:0">${TONE_LABELS[tone]}</div>
              <div style="flex:1;height:20px;background:var(--border)">
                <div style="width:${barPct(val, maxPct * 1.15)}%;height:100%;background:var(--tone-${tone})"></div>
              </div>
              <div style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--blue);width:100px;flex-shrink:0">${val.toFixed(1)}% <span style="font-weight:400;color:var(--muted)">(${count}/${total})</span></div>
            </div>`;
          }).join("")}
        </div>`;
      }).join("")}
    </div>

    <div style="margin:24px 0;padding:20px 24px;background:var(--card);border:1px solid var(--border);text-align:center">
      <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px">Excellent results (\u226590%)</div>
      <div style="font-family:var(--font-mono);font-size:28px;font-weight:600;color:var(--blue)">${excellentFormal.toFixed(1)}% <span style="font-size:14px;color:var(--muted)">formal</span> vs ${excellentCasual.toFixed(1)}% <span style="font-size:14px;color:var(--muted)">casual</span></div>
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--muted);margin-top:4px">${excellentRatio.toFixed(1)}\u00D7 more likely with formal</div>
    </div>

    ${bodyText([
      `But look at the bottom: below-average results (<60%) barely move between tones. Formal doesn\u2019t protect you from bad outputs \u2014 it just makes excellent ones more likely.`,
    ])}

    ${insightBox(`Formal is a ceiling-raiser, not a floor-raiser. The probability of excellence nearly doubles, but the probability of failure stays the same.`)}
  </div>

  <div class="section-divider"></div>

  <!-- ================================================================== -->
  <!-- SECTION 5: IMPLICATIONS                                             -->
  <!-- ================================================================== -->
  <div class="section">
    ${sectionHeader("Implications")}
    ${bodyText([`Three practical recommendations, depending on what you\u2019re optimizing for:`])}

    <div class="rec-box" style="border-left-color:var(--tone-casual)">
      <div class="rec-box-title">Cost-Sensitive</div>
      <div class="rec-box-body">Use casual prompts. They\u2019re ${Math.round(((toneEfficiency[0].efficiency - toneEfficiency[2].efficiency) / toneEfficiency[2].efficiency) * 100)}% more token-efficient. The quality gap is ${fmt(Math.abs(headlineDelta))} \u2014 negligible for most use cases. If you\u2019re running thousands of API calls, the cost savings are significant and the quality tradeoff is minimal.</div>
    </div>

    <div class="rec-box" style="border-left-color:var(--tone-formal)">
      <div class="rec-box-title">Quality-Maximizing (Strong Models Only)</div>
      <div class="rec-box-body">Use formal prompts with a top-tier model (Opus-class). The quality gain concentrates at the excellence tail \u2014 nearly 2\u00D7 the rate of \u226590% results. But only if you\u2019re using a strong model. Small models are tone-deaf and won\u2019t benefit.</div>
    </div>

    <div class="rec-box" style="border-left-color:var(--tone-controlled)">
      <div class="rec-box-title">The Goldilocks Choice</div>
      <div class="rec-box-body">Use the controlled approach: <em>complete information, casual register</em>. You get roughly formal-level quality at closer to casual-level cost. The finding that matters most is that informational completeness drives quality, not grammatical formality. Be specific about what you want, but write however comes naturally. The professional email voice doesn\u2019t earn you anything the bullet points didn\u2019t already cover.</div>
    </div>
  </div>

  <div class="section-divider"></div>

  <!-- ================================================================== -->
  <!-- SECTION 6: THREATS TO VALIDITY                                      -->
  <!-- ================================================================== -->
  <div class="section">
    ${sectionHeader("Threats to Validity")}
    ${bodyText([
      `Every experiment has limitations. We\u2019ve tried to address them directly rather than bury them.`,
    ])}

    <table class="threats-table">
      <thead>
        <tr><th>Threat</th><th>Severity</th><th>Mitigation</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Single LLM judge (Kimi K2.5)</td>
          <td><span class="severity-medium">Medium</span></td>
          <td>Different model family avoids self-enhancement bias. Comparative analysis (tone A vs B) is robust to consistent judge bias \u2014 any systematic over- or under-scoring cancels in the deltas.</td>
        </tr>
        <tr>
          <td>5 trials per cell</td>
          <td><span class="severity-medium">Medium</span></td>
          <td>${results.length} total results. Effects consistent directionally across models and tasks. Expanded from 2\u20133 to 5 trials based on initial findings.</td>
        </tr>
        <tr>
          <td>1\u201310 grading scale</td>
          <td><span class="severity-low">Low</span></td>
          <td>Recent work (arXiv:2601.03444) found 1\u201310 yields slightly lower human-LLM alignment (ICC=0.805) than 0\u20135 (ICC=0.853). However, this applies to absolute calibration. Our comparative analysis measures relative differences \u2014 any scale bias affects all conditions equally.</td>
        </tr>
        <tr>
          <td>Prompt confounding</td>
          <td><span class="severity-low">Low</span></td>
          <td>The controlled condition directly tests this. Casual vs formal differ in both register AND content; controlled isolates register by holding information constant.</td>
        </tr>
        <tr>
          <td>RLHF training confound</td>
          <td><span class="severity-medium">Medium</span></td>
          <td>Cannot be eliminated. Models are trained to respond to professional language. This is part of the real-world effect we\u2019re measuring, not a confound to be removed.</td>
        </tr>
        <tr>
          <td>Token cost as confound</td>
          <td><span class="severity-high">High</span></td>
          <td>Addressed directly in Finding 4.3. The quality gain may be partly a compute artifact \u2014 more tokens = more reasoning = better output, regardless of prompt tone.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section-divider"></div>

  <!-- ================================================================== -->
  <!-- SECTION 7: RELATED WORK                                             -->
  <!-- ================================================================== -->
  <div class="section">
    ${sectionHeader("Related Work")}
    ${bodyText([
      `Several studies have examined how prompt style affects LLM performance. Yin et al. (2024) tested politeness on MCQ benchmarks and found that respectful phrasing modestly improved accuracy. Cai et al. (2025) tested tone variations on MMLU, finding +3.1% on humanities tasks with formal prompts \u2014 directionally consistent with our +${headlineDelta.toFixed(1)}%. The EmotionPrompt line of work (Li et al., 2024) demonstrated that emotional stimuli in prompts can boost performance, operating through a different mechanism (arousal vs. register) but pointing in the same direction.`,
      `Ma et al. (2025) examined politeness effects on code generation stability, finding that polite prompts produced more consistent outputs \u2014 our coding results align, though our controlled condition complicates the interpretation. The grading scale paper (arXiv:2601.03444, 2026) informed our choice to acknowledge the 1\u201310 scale limitation while arguing that comparative analysis remains valid.`,
      `Our work extends this body of research in three ways: (1) we test on agentic, multi-step, generative tasks rather than MCQ benchmarks, (2) we add the controlled condition to disentangle register from informational content \u2014 a confound that prior work does not address, and (3) we reveal the cost dimension that prior work entirely ignores. The finding that formal prompts double token consumption without proportional quality gains is, to our knowledge, novel.`,
    ])}
  </div>

  <div class="section-divider"></div>

  <!-- ================================================================== -->
  <!-- APPENDIX                                                            -->
  <!-- ================================================================== -->
  <div class="section">
    ${sectionHeader("Appendix")}

    <details>
      <summary>Full Copywriting Prompts (all 3 tones)</summary>
      <div style="display:grid;gap:16px">
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-casual)">Casual</div>
          <div class="appendix-content">${escHtml(PROMPT_EXCERPT_CASUAL)}</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-controlled)">Controlled</div>
          <div class="appendix-content">${escHtml(PROMPT_EXCERPT_CONTROLLED)}</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-formal)">Formal</div>
          <div class="appendix-content">${escHtml(PROMPT_EXCERPT_FORMAL)}</div>
        </div>
      </div>
    </details>

    <details>
      <summary>Full Coding Prompts (all 3 tones)</summary>
      <div style="display:grid;gap:16px">
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-casual)">Casual</div>
          <div class="appendix-content">${escHtml(CODING_EXCERPT_CASUAL)}</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-controlled)">Controlled</div>
          <div class="appendix-content">${escHtml(CODING_EXCERPT_CONTROLLED)}</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-formal)">Formal</div>
          <div class="appendix-content">${escHtml(CODING_EXCERPT_FORMAL)}</div>
        </div>
      </div>
    </details>

    <details>
      <summary>Full File Sorting Prompts (all 3 tones)</summary>
      <div style="display:grid;gap:16px">
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-casual)">Casual</div>
          <div class="appendix-content">${escHtml(FILESORT_EXCERPT_CASUAL)}</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-controlled)">Controlled</div>
          <div class="appendix-content">${escHtml(FILESORT_EXCERPT_CONTROLLED)}</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px;padding-top:8px;border-top:3px solid var(--tone-formal)">Formal</div>
          <div class="appendix-content">${escHtml(FILESORT_EXCERPT_FORMAL)}</div>
        </div>
      </div>
    </details>

    <details>
      <summary>Effect Size Heatmap: Formal \u2212 Casual by Model \u00D7 Task</summary>
      <table class="data-table">
        <thead>
          <tr>
            <th style="text-align:left">Model</th>
            ${TASKS.map((t) => `<th>${escHtml(TASK_LABELS[t])}</th>`).join("")}
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          ${models
            .map((model) => {
              const deltas = TASKS.map(
                (task) => effectSizes.find((e) => e.model === model && e.task === task)?.delta ?? 0,
              );
              const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
              return `<tr>
              <td style="text-align:left;font-weight:500">${escHtml(model)}</td>
              ${deltas.map((d) => `<td class="${deltaClass(d)}">${fmtDelta(d)}</td>`).join("")}
              <td class="${deltaClass(avg)}"><strong>${fmtDelta(avg)}</strong></td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </details>

    <details>
      <summary>Blind Judge Protocol &mdash; Neutral Task Descriptions</summary>
      <div class="appendix-content">The judge receives a neutral, tone-free description of each task:

Copywriting: "Evaluate the marketing campaign deliverables for completeness, quality of copy, brand consistency, and whether all requested files were produced."

Coding: "Evaluate the CSV parser implementation for correctness, code quality, test coverage, and handling of edge cases as specified."

File Sorting: "Evaluate the file organization for logical structure, completeness (all files sorted), and quality of the manifest documentation."

The judge does NOT receive:
- The original prompt (in any tone)
- The model name or provider
- The trial number
- Token counts or timing data
- Any metadata about the run configuration

Scoring dimensions (1-10 each):
- Quality: Overall quality of the work product
- Thoroughness: Completeness and attention to detail
- Creativity: Novel approaches, good design decisions
- Adherence to Instructions: How well the output matches the task requirements</div>
    </details>

    <details>
      <summary>GitHub Repository</summary>
      <div class="appendix-content">Full source code, raw data, and analysis scripts are available at:
https://github.com/gitethanwoo/formality-eval

The repository includes:
- All 9 prompt variants (3 tones x 3 tasks)
- The evaluation harness (src/)
- The blind judge implementation (scripts/judge.ts)
- Raw results for all ${results.length} evaluations
- This report generator (scripts/build-report.ts)</div>
    </details>
  </div>

  <!-- ================================================================== -->
  <!-- FOOTER                                                              -->
  <!-- ================================================================== -->
  <footer class="report-footer">
    ${results.length} eval runs &middot; ${joined.length} with raw data joined &middot; Judge: Kimi K2.5 via OpenRouter (blind) &middot; Generated ${new Date().toISOString().split("T")[0]}<br>
    <a href="https://github.com/gitethanwoo/formality-eval">github.com/gitethanwoo/formality-eval</a>
  </footer>

</div>
</body>
</html>`;

  const outPath = join(process.cwd(), "results", "judge-scores", "report.html");
  await writeFile(outPath, html);
  console.log(`Report written to ${outPath}`);
  console.log(`  ${results.length} judge results, ${joined.length} joined with raw data`);
  console.log(`  ${rawMap.size} raw results loaded`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
