import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JudgedEvalResult } from "../src/types.js";

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function mean(nums: number[]): number {
  if (nums.length === 0) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function composite(r: JudgedEvalResult): number {
  const j = r.judgeScores;
  return (j.quality + j.thoroughness + j.creativity + j.adherenceToInstructions) / 4;
}

type Dim = "quality" | "thoroughness" | "creativity" | "adherenceToInstructions";
const DIMS: Dim[] = ["quality", "thoroughness", "creativity", "adherenceToInstructions"];
const DIM_LABELS: Record<Dim, string> = {
  quality: "Quality",
  thoroughness: "Thoroughness",
  creativity: "Creativity",
  adherenceToInstructions: "Adherence",
};

const TONES = ["casual", "controlled", "formal"] as const;
const TASKS = ["copywriting", "coding", "file-sorting"] as const;

function fmt(n: number): string {
  return Number.isNaN(n) ? "--" : n.toFixed(1) + "%";
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bar scaled to maxVal. Returns a height percentage string. */
function barPct(val: number, maxVal: number): number {
  return maxVal === 0 ? 0 : (val / maxVal) * 100;
}

/** Build a vertical bar group (3 tone bars side by side) */
function toneBarGroup(
  label: string,
  values: { tone: string; mean: number; n: number }[],
  maxVal: number,
  barHeight: number
): string {
  const bars = values
    .map(
      (v) => `
      <div class="vbar-col">
        <div class="vbar-value">${fmt(v.mean)}</div>
        <div class="vbar-track" style="height:${barHeight}px">
          <div class="vbar tone-${v.tone}" style="height:${barPct(v.mean, maxVal)}%"></div>
        </div>
      </div>`
    )
    .join("");
  return `
    <div class="vbar-group">
      ${bars}
      <div class="vbar-label">${escHtml(label)}</div>
    </div>`;
}

/** Horizontal bar row */
function hBar(
  label: string,
  value: number,
  maxVal: number,
  tone: string,
  sub?: string
): string {
  const pct = barPct(value, maxVal);
  return `
    <div class="hbar-row">
      <div class="hbar-label">${escHtml(label)}${sub ? `<span class="hbar-sub">${escHtml(sub)}</span>` : ""}</div>
      <div class="hbar-track">
        <div class="hbar tone-${tone}" style="width:${pct}%"></div>
      </div>
      <div class="hbar-value">${fmt(value)}</div>
    </div>`;
}

/** Effect size cell color (thresholds on percentage scale) */
function deltaClass(d: number): string {
  if (d > 3) return "delta-pos";
  if (d < -3) return "delta-neg";
  return "delta-neutral";
}
function fmtDelta(d: number): string {
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const combinedPath = join(process.cwd(), "results", "judge-scores", "combined.json");
  const results = JSON.parse(await readFile(combinedPath, "utf-8")) as JudgedEvalResult[];
  const models = [...new Set(results.map((r) => r.config.model.label))].sort();

  /** Convert a 1-10 score to a 0-100% value */
  const pct = (v: number): number => v * 10;

  // Headline metrics
  const toneStats = TONES.map((tone) => {
    const items = results.filter((r) => r.config.tone === tone);
    return { tone, mean: pct(mean(items.map(composite))), n: items.length };
  });
  const delta = toneStats[2].mean - toneStats[0].mean;

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
      mean(results.filter((r) => r.config.tone === "casual").map((r) => r.judgeScores[dim]))
    ),
  }));

  // Composite by tone × task
  const taskTone = TASKS.map((task) => ({
    task,
    values: TONES.map((tone) => {
      const items = results.filter((r) => r.config.tone === tone && r.config.task === task);
      return { tone, mean: pct(mean(items.map(composite))), n: items.length };
    }),
  }));

  // Composite by tone × model
  const modelTone = models.map((model) => ({
    model,
    values: TONES.map((tone) => {
      const items = results.filter((r) => r.config.model.label === model && r.config.tone === tone);
      return { tone, mean: pct(mean(items.map(composite))), n: items.length };
    }),
  }));

  // Thoroughness by tone × task
  const thoroughTaskTone = TASKS.map((task) => ({
    task,
    values: TONES.map((tone) => {
      const items = results.filter((r) => r.config.tone === tone && r.config.task === task);
      return { tone, mean: pct(mean(items.map((r) => r.judgeScores.thoroughness))), n: items.length };
    }),
  }));

  // Effect sizes: model × task
  const effectSizes = models.flatMap((model) =>
    TASKS.map((task) => {
      const casual = results.filter(
        (r) => r.config.model.label === model && r.config.task === task && r.config.tone === "casual"
      );
      const formal = results.filter(
        (r) => r.config.model.label === model && r.config.task === task && r.config.tone === "formal"
      );
      return {
        model,
        task,
        delta: pct(mean(formal.map(composite)) - mean(casual.map(composite))),
      };
    })
  );

  // Tier
  const tierTone = (["large", "small"] as const).map((tier) => ({
    tier,
    label: tier === "large" ? "Large (Opus, GPT-5.2)" : "Small (Haiku, Codex Mini)",
    values: TONES.map((tone) => {
      const items = results.filter((r) => r.config.model.tier === tier && r.config.tone === tone);
      return { tone, mean: pct(mean(items.map(composite))), n: items.length };
    }),
  }));

  // Max values for chart scaling (percentage scale)
  const maxComposite = 100;
  const maxDim = 100;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Formality Eval Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
  @font-face {
    font-family: 'Departure Mono';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2409-1@1.0/DepartureMono-Regular.woff2') format('woff2');
    font-weight: normal;
    font-display: swap;
  }
  :root {
    --bg: #fafafa;
    --ink: #1a1a2e;
    --muted: #6b7280;
    --border: #e5e7eb;
    --blue: #6366f1;
    --blue-light: rgba(99,102,241,0.08);
    --blue-mid: rgba(99,102,241,0.15);
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
    padding: 48px;
    min-height: 100vh;
    line-height: 1.6;
  }
  .container { max-width: 1000px; margin: 0 auto; }

  /* Header */
  header { margin-bottom: 48px; padding-bottom: 32px; border-bottom: 1px solid var(--border); }
  .pixel-title {
    font-family: 'Departure Mono', var(--font-mono);
    font-size: 38px;
    font-weight: normal;
    color: var(--blue);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin: 0 0 12px;
  }
  .title-sep { color: var(--muted); margin: 0 12px; }
  .title-date { color: var(--muted); font-size: 28px; }
  h1 {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--muted);
  }
  .intro {
    font-size: 15px;
    color: var(--muted);
    line-height: 1.7;
    max-width: 680px;
    margin-top: 16px;
  }

  /* Metrics */
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    margin-bottom: 48px;
  }
  @media (max-width: 700px) { .metrics { grid-template-columns: 1fr 1fr; } }
  .metric { background: var(--bg); padding: 24px; position: relative; }
  .metric-label {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .metric-value {
    font-family: var(--font-mono);
    font-size: 32px;
    font-weight: 600;
    color: var(--blue);
  }
  .metric-value.positive { color: var(--green); }
  .metric-fig {
    position: absolute;
    top: 12px;
    right: 12px;
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--muted);
    opacity: 0.6;
  }
  .metric-sub {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
    margin-top: 6px;
  }

  /* Section */
  .section { margin-bottom: 48px; }
  .section-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }
  .section-title {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--ink);
    white-space: nowrap;
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
  }
  .section-desc {
    font-size: 14px;
    color: var(--muted);
    line-height: 1.6;
    margin-bottom: 20px;
    max-width: 600px;
  }
  .insight-box {
    margin-top: 20px;
    padding: 16px 20px;
    background: var(--blue-light);
    border-left: 3px solid var(--blue);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink);
    line-height: 1.6;
  }

  /* Legend */
  .tone-legend {
    display: flex;
    gap: 24px;
    margin-bottom: 20px;
  }
  .tone-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }
  .tone-swatch { width: 12px; height: 12px; }
  .tone-swatch.tone-casual { background: var(--tone-casual); }
  .tone-swatch.tone-controlled { background: var(--tone-controlled); }
  .tone-swatch.tone-formal { background: var(--tone-formal); }

  /* Vertical bars */
  .chart-panel {
    border: 1px solid var(--border);
    background: white;
    padding: 32px;
  }
  .vbar-chart {
    display: flex;
    align-items: flex-end;
    gap: 32px;
    padding: 0;
  }
  .vbar-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }
  .vbar-group > div:first-child { /* wrapper for the 3 columns */ }
  .vbar-group {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .vbar-group .vbar-cols {
    display: flex;
    gap: 4px;
    align-items: flex-end;
  }
  .vbar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .vbar-value {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .vbar-col:hover .vbar-value { opacity: 1; }
  .vbar-track {
    width: 28px;
    background: var(--border);
    display: flex;
    align-items: flex-end;
    position: relative;
  }
  .vbar {
    width: 100%;
    transition: height 0.3s ease;
  }
  .vbar.tone-casual { background: var(--tone-casual); }
  .vbar.tone-controlled { background: var(--tone-controlled); }
  .vbar.tone-formal { background: var(--tone-formal); }
  .vbar-label {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    margin-top: 8px;
    text-align: center;
  }

  /* Horizontal bars */
  .hbar-chart { max-width: 700px; }
  .hbar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .hbar-label {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink);
    width: 120px;
    flex-shrink: 0;
    text-align: right;
  }
  .hbar-sub {
    display: block;
    font-size: 9px;
    color: var(--muted);
  }
  .hbar-track {
    flex: 1;
    height: 20px;
    background: var(--border);
    position: relative;
  }
  .hbar {
    height: 100%;
    transition: width 0.3s ease;
  }
  .hbar.tone-casual { background: var(--tone-casual); }
  .hbar.tone-controlled { background: var(--tone-controlled); }
  .hbar.tone-formal { background: var(--tone-formal); }
  .hbar-value {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--blue);
    width: 40px;
    flex-shrink: 0;
  }

  /* Heatmap table */
  .heatmap-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .heatmap-table th, .heatmap-table td {
    padding: 12px 16px;
    text-align: center;
    border: 1px solid var(--border);
  }
  .heatmap-table th {
    background: white;
    color: var(--muted);
    font-weight: 500;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .heatmap-table td {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: white;
  }
  .delta-pos { color: var(--green); }
  .delta-neg { color: var(--red); }
  .delta-neutral { color: var(--muted); }

  /* Chart footer */
  .chart-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }

  /* Two col layout */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }

  .report-footer {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    text-align: center;
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <p class="pixel-title">FORMALITY EVAL <span class="title-sep">//</span> <span class="title-date">2026</span></p>
    <h1>Blind LLM Judge Analysis</h1>
    <p class="intro">
      Does the tone of a prompt affect the quality of an LLM's output? We ran ${results.length} evaluations across
      4 models, 3 tones (casual, controlled, formal), and 3 tasks (copywriting, coding, file-sorting).
      A blind judge (Kimi K2.5) scored each output on quality, thoroughness, creativity, and instruction adherence
      without knowing which model or tone produced it.
    </p>
  </header>

  <div class="metrics">
    <div class="metric">
      <span class="metric-fig">FIG.001</span>
      <div class="metric-label">Casual</div>
      <div class="metric-value">${fmt(toneStats[0].mean)}</div>
      <div class="metric-sub">n=${toneStats[0].n} runs</div>
    </div>
    <div class="metric">
      <span class="metric-fig">FIG.002</span>
      <div class="metric-label">Controlled</div>
      <div class="metric-value">${fmt(toneStats[1].mean)}</div>
      <div class="metric-sub">n=${toneStats[1].n} runs</div>
    </div>
    <div class="metric">
      <span class="metric-fig">FIG.003</span>
      <div class="metric-label">Formal</div>
      <div class="metric-value">${fmt(toneStats[2].mean)}</div>
      <div class="metric-sub">n=${toneStats[2].n} runs</div>
    </div>
    <div class="metric">
      <span class="metric-fig">FIG.004</span>
      <div class="metric-label">Formal \u2212 Casual</div>
      <div class="metric-value positive">${fmtDelta(delta)}</div>
      <div class="metric-sub">composite delta</div>
    </div>
  </div>

  <div class="tone-legend">
    <div class="tone-legend-item"><div class="tone-swatch tone-casual"></div> Casual</div>
    <div class="tone-legend-item"><div class="tone-swatch tone-controlled"></div> Controlled</div>
    <div class="tone-legend-item"><div class="tone-swatch tone-formal"></div> Formal</div>
  </div>

  <!-- DIMENSIONS -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Score Dimensions by Tone</span>
      <span class="section-line"></span>
      <span class="section-annotation">FIG.005</span>
    </div>
    <p class="section-desc">
      Breaking the composite into its four components. Thoroughness shows the largest
      tone effect; creativity is essentially unaffected.
    </p>
    <div class="hbar-chart">
      ${dimByTone
        .flatMap((d) => [
          `<div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:16px;margin-bottom:4px">${d.label} <span style="color:${d.delta > 3 ? "var(--green)" : d.delta < -3 ? "var(--red)" : "var(--muted)"};margin-left:8px">\u0394 ${fmtDelta(d.delta)}</span></div>`,
          ...d.values.map((v) =>
            hBar(v.tone, v.mean, maxDim, v.tone)
          ),
        ])
        .join("")}
    </div>
  </div>

  <!-- TONE x TASK -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Composite by Task</span>
      <span class="section-line"></span>
      <span class="section-annotation">FIG.006</span>
    </div>
    <p class="section-desc">
      Does tone matter more for some tasks? Coding shows a compressed range (hard ceiling),
      while copywriting and file-sorting show clearer tone gradients.
    </p>
    <div class="chart-panel">
      <div class="vbar-chart">
        ${taskTone
          .map(
            (t) => `
          <div style="flex:1;text-align:center">
            <div style="display:flex;gap:4px;justify-content:center;align-items:flex-end;height:180px">
              ${t.values
                .map(
                  (v) => `
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                  <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${fmt(v.mean)}</div>
                  <div style="width:28px;height:180px;background:var(--border);display:flex;align-items:flex-end">
                    <div class="tone-${v.tone}" style="width:100%;height:${barPct(v.mean, maxComposite)}%"></div>
                  </div>
                </div>`
                )
                .join("")}
            </div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:8px">${t.task}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>
    <div class="insight-box">
      \u2192 Controlled \u2248 Formal across all tasks. The informational completeness of the prompt matters more than its register or politeness.
    </div>
  </div>

  <!-- THOROUGHNESS DEEP DIVE -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Thoroughness by Task</span>
      <span class="section-line"></span>
      <span class="section-annotation">FIG.007</span>
    </div>
    <p class="section-desc">
      Thoroughness had the strongest tone signal (+6.0% overall). Here it is broken down by task.
    </p>
    <div class="chart-panel">
      <div class="vbar-chart">
        ${thoroughTaskTone
          .map(
            (t) => `
          <div style="flex:1;text-align:center">
            <div style="display:flex;gap:4px;justify-content:center;align-items:flex-end;height:180px">
              ${t.values
                .map(
                  (v) => `
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                  <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${fmt(v.mean)}</div>
                  <div style="width:28px;height:180px;background:var(--border);display:flex;align-items:flex-end">
                    <div class="tone-${v.tone}" style="width:100%;height:${barPct(v.mean, maxComposite)}%"></div>
                  </div>
                </div>`
                )
                .join("")}
            </div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:8px">${t.task}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>
  </div>

  <!-- MODEL x TONE -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Composite by Model</span>
      <span class="section-line"></span>
      <span class="section-annotation">FIG.008</span>
    </div>
    <p class="section-desc">
      Are some models more sensitive to prompt tone? Opus shows the strongest gradient;
      Codex Mini is relatively flat.
    </p>
    <div class="chart-panel">
      <div class="vbar-chart">
        ${modelTone
          .map(
            (m) => `
          <div style="flex:1;text-align:center">
            <div style="display:flex;gap:4px;justify-content:center;align-items:flex-end;height:180px">
              ${m.values
                .map(
                  (v) => `
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                  <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${fmt(v.mean)}</div>
                  <div style="width:28px;height:180px;background:var(--border);display:flex;align-items:flex-end">
                    <div class="tone-${v.tone}" style="width:100%;height:${barPct(v.mean, maxComposite)}%"></div>
                  </div>
                </div>`
                )
                .join("")}
            </div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:8px">${m.model.replace("Claude ", "").replace("GPT-", "GPT ")}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>
  </div>

  <!-- TIER -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Composite by Model Tier</span>
      <span class="section-line"></span>
      <span class="section-annotation">FIG.009</span>
    </div>
    <p class="section-desc">
      Large models show a slightly larger tone sensitivity than small models,
      but both exhibit the same directional pattern.
    </p>
    <div class="chart-panel">
      <div class="vbar-chart">
        ${tierTone
          .map(
            (t) => `
          <div style="flex:1;text-align:center">
            <div style="display:flex;gap:4px;justify-content:center;align-items:flex-end;height:180px">
              ${t.values
                .map(
                  (v) => `
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                  <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${fmt(v.mean)}</div>
                  <div style="width:28px;height:180px;background:var(--border);display:flex;align-items:flex-end">
                    <div class="tone-${v.tone}" style="width:100%;height:${barPct(v.mean, maxComposite)}%"></div>
                  </div>
                </div>`
                )
                .join("")}
            </div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:8px">${t.label}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>
  </div>

  <!-- EFFECT SIZE HEATMAP -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Effect Size: Formal \u2212 Casual</span>
      <span class="section-line"></span>
      <span class="section-annotation">FIG.010</span>
    </div>
    <p class="section-desc">
      Delta in composite score (formal minus casual) by model and task.
      Green indicates formal scored higher; red indicates casual scored higher.
    </p>
    <table class="heatmap-table">
      <thead>
        <tr>
          <th style="text-align:left">Model</th>
          ${TASKS.map((t) => `<th>${t}</th>`).join("")}
          <th>Avg</th>
        </tr>
      </thead>
      <tbody>
        ${models
          .map((model) => {
            const deltas = TASKS.map(
              (task) => effectSizes.find((e) => e.model === model && e.task === task)?.delta ?? 0
            );
            const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
            return `<tr>
              <th style="text-align:left;font-weight:500">${model}</th>
              ${deltas.map((d) => `<td class="${deltaClass(d)}">${fmtDelta(d)}</td>`).join("")}
              <td class="${deltaClass(avg)}"><strong>${fmtDelta(avg)}</strong></td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <div class="insight-box">
      \u2192 Claude Opus shows the most consistent formal advantage (+7.2% avg).
      GPT-5.2 Codex is inconsistent \u2014 formal helps for copywriting and file-sorting but
      slightly hurts coding (\u22123.8%).
    </div>
  </div>

  <!-- TAKEAWAYS -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Key Findings</span>
      <span class="section-line"></span>
    </div>
    <div class="insight-box" style="margin-top:0;margin-bottom:16px">
      <strong>1. Formal prompts produce modestly higher blind-judged quality.</strong>
      The composite delta is ${fmtDelta(delta)}, driven primarily by thoroughness (+6.0%).
      Creativity is unaffected.
    </div>
    <div class="insight-box" style="margin-bottom:16px">
      <strong>2. Controlled \u2248 Formal.</strong>
      The "controlled" tone (same information as formal, but casual register) performs nearly identically
      to formal. This suggests that informational completeness matters more than politeness or register.
    </div>
    <div class="insight-box" style="margin-bottom:16px">
      <strong>3. The effect varies by model.</strong>
      Opus shows the largest sensitivity (composite +7.2%). GPT-5.2 Codex is inconsistent across tasks.
      Small models show a smaller but directionally similar pattern.
    </div>
    <div class="insight-box" style="margin-bottom:16px">
      <strong>4. Caveat: small sample sizes.</strong>
      With 2\u20133 trials per cell, these effect sizes are suggestive, not conclusive.
      The consistent directionality across models and tasks strengthens the signal,
      but a larger study would be needed for statistical significance.
    </div>
    <div class="insight-box">
      <strong>5. On grading scale choice.</strong>
      We use a 1\u201310 scale, which recent work (arXiv:2601.03444) found yields slightly lower
      human-LLM alignment (ICC=0.805) than 0\u20135 (ICC=0.853). However, this concern applies
      primarily to absolute calibration against human raters. Our analysis is comparative\u2014we
      measure relative differences between tone conditions, not absolute quality. Any consistent
      scale bias affects all conditions equally and cancels out in the deltas that drive our findings.
    </div>
  </div>

  <footer class="report-footer">
    ${results.length} eval runs \u00b7 Judge: Kimi K2.5 via OpenRouter (blind) \u00b7 Generated ${new Date().toISOString().split("T")[0]}
  </footer>
</div>
</body>
</html>`;

  const outPath = join(process.cwd(), "results", "judge-scores", "report.html");
  await writeFile(outPath, html);
  console.log(`Report written to ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
