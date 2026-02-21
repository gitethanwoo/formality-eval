import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSystemPrompt, getTaskPrompt as getPrompt } from "../src/prompts/tones.js";
import type { EvalRunResult, TaskType, ToneStyle } from "../src/types.js";

// Collect all results, deduplicate by taking latest per config
const resultsRoot = join(process.cwd(), "results");
const resultMap = new Map<string, EvalRunResult>();
for (const dir of readdirSync(resultsRoot).sort()) {
  const rawDir = join(resultsRoot, dir, "raw");
  try {
    for (const file of readdirSync(rawDir)) {
      if (file.endsWith(".json")) {
        const r: EvalRunResult = JSON.parse(readFileSync(join(rawDir, file), "utf-8"));
        const key = `${r.config.model.label}|${r.config.tone}|${r.config.task}`;
        resultMap.set(key, r); // latest wins
      }
    }
  } catch { /* skip */ }
}
const allResults = [...resultMap.values()];
console.log(`Found ${allResults.length} unique results`);

const TONES: ToneStyle[] = ["casual", "controlled", "formal"];
const TONE_COLORS: Record<ToneStyle, string> = { casual: "#f97316", controlled: "#8b5cf6", formal: "#3b82f6" };
const TONE_BG: Record<ToneStyle, string> = { casual: "#fef3c7", controlled: "#ede9fe", formal: "#dbeafe" };
const TONE_TEXT: Record<ToneStyle, string> = { casual: "#92400e", controlled: "#5b21b6", formal: "#1e40af" };
const seedFiles = ["brand-guide.md", "README.md"];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wc(artifacts: Record<string, string>): number {
  return Object.entries(artifacts)
    .filter(([k]) => !seedFiles.includes(k))
    .reduce((sum, [, v]) => sum + v.split(/\s+/).filter(Boolean).length, 0);
}

// Group by model+task -> { casual, controlled, formal }
interface Triad { casual?: EvalRunResult; controlled?: EvalRunResult; formal?: EvalRunResult }
const triads = new Map<string, Triad>();
for (const r of allResults) {
  const key = `${r.config.model.label}|||${r.config.task}`;
  if (!triads.has(key)) triads.set(key, {});
  triads.get(key)![r.config.tone] = r;
}

// Group by model -> results, and by task -> results
const byModel = new Map<string, EvalRunResult[]>();
const byTask = new Map<string, EvalRunResult[]>();
for (const r of allResults) {
  const m = r.config.model.label;
  const t = r.config.task;
  if (!byModel.has(m)) byModel.set(m, []);
  if (!byTask.has(t)) byTask.set(t, []);
  byModel.get(m)!.push(r);
  byTask.get(t)!.push(r);
}

let figNum = 0;
let tableNum = 0;
function fig(text: string): string { figNum++; return `<figcaption><strong>Figure ${figNum}.</strong> ${text}</figcaption>`; }
function tbl(text: string): string { tableNum++; return `<caption><strong>Table ${tableNum}.</strong> ${text}</caption>`; }

function barSvg(values: { label: string; value: number; color: string }[], maxVal: number, unit: string): string {
  const barH = 26, gap = 5, labelW = 90, valueW = 110, barW = 320;
  const totalH = values.length * (barH + gap);
  const rows = values.map((v, i) => {
    const y = i * (barH + gap);
    const w = maxVal > 0 ? Math.max((v.value / maxVal) * barW, 1) : 1;
    return `<text x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end" class="svg-label">${esc(v.label)}</text>
      <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${v.color}" opacity="0.85"/>
      <text x="${labelW + barW + 8}" y="${y + barH / 2 + 4}" class="svg-value">${v.value.toLocaleString()} ${unit}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${labelW + barW + valueW} ${totalH}" class="bar-chart">${rows}</svg>`;
}

function triadChart(triad: Triad, metric: (r: EvalRunResult) => number, unit: string, caption: string): string {
  const vals = TONES.map(t => {
    const r = triad[t];
    return { label: t, value: r ? metric(r) : 0, color: TONE_COLORS[t] };
  }).filter(v => v.value > 0);
  if (vals.length === 0) return "";
  const max = Math.max(...vals.map(v => v.value));
  return `<figure>${barSvg(vals, max, unit)}${fig(caption)}</figure>`;
}

// ---- Build summary tables by task ----
function buildTaskSummary(task: string, results: EvalRunResult[]): string {
  const models = [...new Set(results.map(r => r.config.model.label))].sort();
  let rows = "";
  for (const model of models) {
    const modelResults = results.filter(r => r.config.model.label === model);
    for (const tone of TONES) {
      const r = modelResults.find(x => x.config.tone === tone);
      if (!r) continue;
      const words = wc(r.artifacts);
      rows += `<tr>
        <td>${esc(model)}</td>
        <td><span class="tone-label ${tone}">${tone}</span></td>
        <td>${r.totalSteps}</td>
        <td>${r.totalToolCalls}</td>
        <td>${words.toLocaleString()}</td>
        <td>${r.totalTokens.toLocaleString()}</td>
        <td><strong>${r.scores.laziness.lazinessIndex.toFixed(3)}</strong></td>
        <td>${(r.scores.laziness.completenessRate * 100).toFixed(0)}%</td>
      </tr>`;
    }
  }
  return `<table class="data-table">
    ${tbl(`All runs for the <em>${esc(task)}</em> task.`)}
    <thead><tr><th>Model</th><th>Tone</th><th>Steps</th><th>Tools</th><th>Words</th><th>Tokens</th><th>Laziness</th><th>Complete</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---- Build per-experiment sections ----
function renderExperiment(key: string, triad: Triad): string {
  const [model, task] = key.split("|||");
  const taskType = task as TaskType;
  const s: string[] = [];

  s.push(`<h4>${esc(model)} — ${esc(task)}</h4>`);

  // Prompts side by side (all 3)
  s.push(`<div class="prompt-comparison three-col">`);
  for (const tone of TONES) {
    const prompt = getPrompt(taskType, tone);
    s.push(`<div class="prompt-condition">
      <div class="condition-label ${tone}">${tone}</div>
      <div class="prompt-block">
        <div class="prompt-role">User Prompt <span class="dim">(${prompt.length} chars)</span></div>
        <pre class="prompt-text">${esc(prompt)}</pre>
      </div>
    </div>`);
  }
  s.push(`</div>`);

  // Charts
  const has3 = triad.casual && triad.controlled && triad.formal;
  if (has3) {
    s.push(triadChart(triad, r => r.totalSteps, "steps", `Steps taken by ${esc(model)} on ${esc(task)}.`));
    s.push(triadChart(triad, r => r.totalToolCalls, "calls", `Tool calls by ${esc(model)} on ${esc(task)}.`));
    s.push(triadChart(triad, r => wc(r.artifacts), "words", `Words of output by ${esc(model)} on ${esc(task)}.`));
    s.push(triadChart(triad, r => r.totalTokens, "tokens", `Tokens consumed by ${esc(model)} on ${esc(task)}.`));

    // Comparison table
    const c = triad.casual!, ctrl = triad.controlled!, f = triad.formal!;
    const cW = wc(c.artifacts), ctrlW = wc(ctrl.artifacts), fW = wc(f.artifacts);
    s.push(`<table class="data-table">
      ${tbl(`Comparison across all three conditions for ${esc(model)} on ${esc(task)}.`)}
      <thead><tr><th>Metric</th><th>Casual</th><th>Controlled</th><th>Formal</th></tr></thead>
      <tbody>
        <tr><td>Steps</td><td>${c.totalSteps}</td><td>${ctrl.totalSteps}</td><td>${f.totalSteps}</td></tr>
        <tr><td>Tool calls</td><td>${c.totalToolCalls}</td><td>${ctrl.totalToolCalls}</td><td>${f.totalToolCalls}</td></tr>
        <tr><td>Words</td><td>${cW.toLocaleString()}</td><td>${ctrlW.toLocaleString()}</td><td>${fW.toLocaleString()}</td></tr>
        <tr><td>Tokens</td><td>${c.totalTokens.toLocaleString()}</td><td>${ctrl.totalTokens.toLocaleString()}</td><td>${f.totalTokens.toLocaleString()}</td></tr>
        <tr><td>Completeness</td><td>${(c.scores.laziness.completenessRate * 100).toFixed(0)}%</td><td>${(ctrl.scores.laziness.completenessRate * 100).toFixed(0)}%</td><td>${(f.scores.laziness.completenessRate * 100).toFixed(0)}%</td></tr>
        <tr class="highlight-row"><td><strong>Laziness</strong></td><td><strong>${c.scores.laziness.lazinessIndex.toFixed(3)}</strong></td><td><strong>${ctrl.scores.laziness.lazinessIndex.toFixed(3)}</strong></td><td><strong>${f.scores.laziness.lazinessIndex.toFixed(3)}</strong></td></tr>
      </tbody>
    </table>`);
  }

  // Artifacts (all 3 columns)
  s.push(`<details class="artifacts-outer"><summary>View produced artifacts</summary>`);
  s.push(`<div class="artifacts-comparison three-col">`);
  for (const tone of TONES) {
    const r = triad[tone];
    s.push(`<div class="artifacts-side"><div class="condition-label ${tone} small">${tone}</div>`);
    if (!r) { s.push(`<p class="dim">Not run.</p>`); }
    else {
      const files = Object.entries(r.artifacts).filter(([k]) => !seedFiles.includes(k));
      for (const [name, content] of files) {
        const words = content.split(/\s+/).filter(Boolean).length;
        const preview = content.length > 800 ? content.slice(0, 800) + "\n[..." + (content.length - 800) + " chars truncated]" : content;
        s.push(`<details class="artifact-detail"><summary><code>${esc(name)}</code> — ${words} words</summary><pre class="artifact-pre">${esc(preview)}</pre></details>`);
      }
    }
    s.push(`</div>`);
  }
  s.push(`</div></details>`);

  return `<section class="experiment">${s.join("\n")}</section>`;
}

// ---- Cross-model comparison for a given task ----
function crossModelTable(task: string): string {
  const models = [...new Set(allResults.filter(r => r.config.task === task).map(r => r.config.model.label))].sort();
  let rows = "";
  for (const model of models) {
    const get = (tone: ToneStyle) => allResults.find(r => r.config.model.label === model && r.config.task === task && r.config.tone === tone);
    const c = get("casual"), ctrl = get("controlled"), f = get("formal");
    if (!c || !f) continue;
    const delta = c.scores.laziness.lazinessIndex - f.scores.laziness.lazinessIndex;
    const ctrlDelta = ctrl ? ctrl.scores.laziness.lazinessIndex - f.scores.laziness.lazinessIndex : null;
    rows += `<tr>
      <td>${esc(model)}</td>
      <td>${c.scores.laziness.lazinessIndex.toFixed(3)}</td>
      <td>${ctrl ? ctrl.scores.laziness.lazinessIndex.toFixed(3) : "—"}</td>
      <td>${f.scores.laziness.lazinessIndex.toFixed(3)}</td>
      <td class="${delta > 0.05 ? "pos-delta" : delta < -0.05 ? "neg-delta" : ""}">${delta > 0 ? "+" : ""}${delta.toFixed(3)}</td>
      <td class="${ctrlDelta !== null && ctrlDelta > 0.05 ? "pos-delta" : ctrlDelta !== null && ctrlDelta < -0.05 ? "neg-delta" : ""}">${ctrlDelta !== null ? (ctrlDelta > 0 ? "+" : "") + ctrlDelta.toFixed(3) : "—"}</td>
    </tr>`;
  }
  return `<table class="data-table">
    ${tbl(`Cross-model laziness comparison for <em>${esc(task)}</em>. &Delta;(C-F) = casual minus formal; &Delta;(Ctrl-F) = controlled minus formal. Positive = lazier than formal.`)}
    <thead><tr><th>Model</th><th>Casual</th><th>Controlled</th><th>Formal</th><th>&Delta;(C-F)</th><th>&Delta;(Ctrl-F)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---- Assemble HTML ----
const models = [...new Set(allResults.map(r => r.config.model.label))];
const tasks = [...new Set(allResults.map(r => r.config.task))];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Formality and AI Effort: An Empirical Evaluation</title>
  <style>
    :root { --casual: #d97706; --controlled: #7c3aed; --formal: #2563eb; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 17px; line-height: 1.75; color: #1a1a1a; background: #fff; max-width: 1060px; margin: 0 auto; padding: 3rem 2rem; }
    h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 0.3rem; line-height: 1.3; }
    h2 { font-size: 1.35rem; font-weight: 700; margin: 2.5rem 0 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid #ddd; }
    h3 { font-size: 1.15rem; font-weight: 700; margin: 2rem 0 0.6rem; }
    h4 { font-size: 1.05rem; font-weight: 700; margin: 1.8rem 0 0.5rem; }
    p { margin-bottom: 0.8rem; }
    ol, ul { margin: 0.5rem 0 1rem 1.5rem; }
    li { margin-bottom: 0.3rem; }
    code { font-family: 'SF Mono','Menlo','Consolas',monospace; font-size: 0.88em; background: #f5f5f5; padding: 0.1em 0.3em; border-radius: 3px; }
    .dim { color: #888; font-size: 0.9em; }
    .authors { color: #555; margin-bottom: 2rem; font-size: 0.95rem; }
    .abstract { background: #f9f9f9; border-left: 3px solid #333; padding: 1rem 1.2rem; margin: 1.5rem 0; font-size: 0.95rem; }
    .abstract strong { display: block; margin-bottom: 0.3rem; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.08em; }

    /* Tone labels */
    .tone-label, .condition-label { font-family: -apple-system,system-ui,sans-serif; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 0.2rem 0.5rem; border-radius: 3px; display: inline-block; }
    .casual, .tone-label.casual { background: ${TONE_BG.casual}; color: ${TONE_TEXT.casual}; }
    .controlled, .tone-label.controlled { background: ${TONE_BG.controlled}; color: ${TONE_TEXT.controlled}; }
    .formal, .tone-label.formal { background: ${TONE_BG.formal}; color: ${TONE_TEXT.formal}; }
    .condition-label.small { font-size: 0.68rem; margin-bottom: 0.5rem; }

    /* Prompts */
    .prompt-comparison { display: grid; gap: 1rem; margin: 1rem 0 1.5rem; }
    .prompt-comparison.three-col { grid-template-columns: 1fr 1fr 1fr; }
    .prompt-condition { border: 1px solid #e0e0e0; border-radius: 4px; padding: 0.8rem; }
    .prompt-block { margin-top: 0.5rem; }
    .prompt-role { font-family: -apple-system,system-ui,sans-serif; font-size: 0.72rem; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.2rem; }
    .prompt-text { font-family: 'SF Mono','Menlo',monospace; font-size: 0.72rem; line-height: 1.45; background: #fafafa; border: 1px solid #eee; border-radius: 3px; padding: 0.5rem 0.6rem; white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow-y: auto; }

    /* Figures & charts */
    figure { margin: 1rem 0; }
    figcaption { font-size: 0.85rem; color: #555; margin-top: 0.3rem; line-height: 1.4; }
    .bar-chart { width: 100%; max-width: 530px; display: block; }
    .svg-label { font-family: -apple-system,system-ui,sans-serif; font-size: 11px; fill: #555; }
    .svg-value { font-family: -apple-system,system-ui,sans-serif; font-size: 11px; fill: #333; font-weight: 600; }

    /* Tables */
    .data-table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-family: -apple-system,system-ui,sans-serif; font-size: 0.85rem; }
    .data-table caption { text-align: left; font-family: Georgia,serif; font-size: 0.85rem; color: #555; margin-bottom: 0.5rem; line-height: 1.4; }
    .data-table th { text-align: left; padding: 0.5rem 0.7rem; border-bottom: 2px solid #333; font-weight: 600; font-size: 0.78rem; }
    .data-table td { padding: 0.4rem 0.7rem; border-bottom: 1px solid #e5e5e5; }
    .data-table .highlight-row td { border-top: 2px solid #333; border-bottom: 2px solid #333; background: #f9f9f9; }
    .pos-delta { color: #b91c1c; font-weight: 600; }
    .neg-delta { color: #047857; font-weight: 600; }

    /* Artifacts */
    .artifacts-outer { margin: 0.8rem 0; }
    .artifacts-outer > summary { cursor: pointer; font-family: -apple-system,system-ui,sans-serif; font-size: 0.88rem; font-weight: 600; padding: 0.4rem 0; }
    .artifacts-comparison { display: grid; gap: 1rem; margin: 0.5rem 0; }
    .artifacts-comparison.three-col { grid-template-columns: 1fr 1fr 1fr; }
    .artifacts-side { min-width: 0; }
    .artifact-detail { margin-bottom: 0.3rem; }
    .artifact-detail summary { cursor: pointer; font-family: -apple-system,system-ui,sans-serif; font-size: 0.82rem; padding: 0.25rem 0; }
    .artifact-pre { font-family: 'SF Mono','Menlo',monospace; font-size: 0.7rem; line-height: 1.4; background: #fafafa; border: 1px solid #eee; border-radius: 3px; padding: 0.5rem; white-space: pre-wrap; word-break: break-word; max-height: 350px; overflow-y: auto; margin: 0.2rem 0 0.4rem; }

    .experiment { margin: 1.5rem 0; padding-bottom: 1.5rem; border-bottom: 1px solid #eee; }
    .experiment:last-child { border-bottom: none; }
    .finding { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 0.8rem 1rem; margin: 1rem 0; font-size: 0.95rem; }
    .finding strong { color: #92400e; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #ddd; color: #888; font-size: 0.8rem; }

    @media (max-width: 800px) {
      .prompt-comparison.three-col, .artifacts-comparison.three-col { grid-template-columns: 1fr; }
      body { padding: 1.5rem 1rem; font-size: 16px; }
    }
  </style>
</head>
<body>

<h1>Does Prompt Formality Affect AI Effort?</h1>
<p class="authors">An empirical evaluation of prompt register on model output thoroughness</p>

<div class="abstract">
  <strong>Abstract</strong>
  We evaluate whether the linguistic register of a user prompt — casual versus formal — affects the thoroughness of AI model outputs on identical tasks. To disentangle tone from instruction content, we employ three conditions: <em>authentic casual</em> (natural brief style), <em>controlled casual</em> (same directives as formal, casual register), and <em>authentic formal</em> (professional with explicit quality expectations). We test ${models.length} models (${models.join(", ")}) across 3 tasks (copywriting, coding, file organization) with sandboxed tool access and up to 400 agentic steps. We find that the effect is model-dependent and task-dependent: Anthropic models show sensitivity to both tone and instruction content, while OpenAI Codex models are largely insensitive to prompt style on most tasks.
</div>

<h2>1. Methodology</h2>

<h3>1.1 Experimental Design</h3>

<p>We construct a ${models.length} &times; 3 &times; 3 evaluation matrix (${allResults.length} total runs). Each run provisions a fresh sandboxed environment via <code>bash-tool</code> + <code>just-bash</code> (an in-memory virtual filesystem) pre-loaded with task-specific seed files. Models receive three tools: <code>bash</code>, <code>readFile</code>, and <code>writeFile</code>. The model may take up to 400 steps. We record every step's tool calls, text output, and token usage.</p>

<h3>1.2 Three Conditions</h3>

<p>The system prompt is held constant across all conditions:</p>
<pre class="prompt-text" style="max-width:700px;margin:0.5rem 0 1rem;">${esc(getSystemPrompt("casual"))}</pre>

<p>The independent variable is the <em>user prompt</em>, which varies across three conditions:</p>

<ol>
  <li><strong><span class="tone-label casual">Casual</span> (Authentic)</strong> — How a casual user would naturally write the request. Less direction, terse, colloquial. Represents the real-world casual use case.</li>
  <li><strong><span class="tone-label controlled">Controlled</span></strong> — Same directives and information content as formal, but written in casual register (lowercase, contractions, informal phrasing). Isolates the effect of <em>tone alone</em> from instruction content.</li>
  <li><strong><span class="tone-label formal">Formal</span> (Authentic)</strong> — How a professional user would write the request. Explicit quality expectations, process instructions, markdown formatting. Represents the real-world formal use case.</li>
</ol>

<p>The controlled condition enables two comparisons: <em>casual vs. controlled</em> measures the effect of instruction specificity (information gap), and <em>controlled vs. formal</em> measures the effect of register alone (tone gap).</p>

<h3>1.3 Laziness Index</h3>

<p>We compute a composite laziness index <em>L</em> &isin; [0, 1] where higher values indicate lazier behavior:</p>

<p style="text-align:center;font-family:-apple-system,system-ui,sans-serif;font-size:0.95rem;margin:1rem 0;">
  <em>L</em> = 0.4(1 &minus; completeness) + 0.3(1 &minus; steps/20) + 0.2(1 &minus; volume/expected) + 0.1(1 &minus; tools_used/4)
</p>

<p>Completeness is task-specific: deliverable count for copywriting, test pass rate for coding, sort accuracy for file organization.</p>

<h3>1.4 Models</h3>

<table class="data-table">
  ${tbl("Models evaluated.")}
  <thead><tr><th>Model</th><th>Provider</th><th>Tier</th><th>Reasoning</th></tr></thead>
  <tbody>
    <tr><td>Claude Opus 4.6</td><td>Anthropic</td><td>Large</td><td>Thinking (8K budget)</td></tr>
    <tr><td>Claude Haiku 4.5</td><td>Anthropic</td><td>Small</td><td>Thinking (8K budget)</td></tr>
    <tr><td>GPT-5.2 Codex</td><td>OpenAI</td><td>Large</td><td>Medium reasoning</td></tr>
    <tr><td>GPT-5.1 Codex Mini</td><td>OpenAI</td><td>Small</td><td>Medium reasoning</td></tr>
  </tbody>
</table>

<h2>2. Results by Task</h2>

${tasks.sort().map(task => {
  const taskResults = allResults.filter(r => r.config.task === task);
  const html: string[] = [];
  html.push(`<h3>2.${tasks.sort().indexOf(task) + 1} ${task.charAt(0).toUpperCase() + task.slice(1)}</h3>`);
  html.push(buildTaskSummary(task, taskResults));
  html.push(crossModelTable(task));

  // Per-model experiments for this task
  const taskTriads = [...triads.entries()].filter(([k]) => k.endsWith(`|||${task}`));
  for (const [key, triad] of taskTriads) {
    html.push(renderExperiment(key, triad));
  }
  return html.join("\n");
}).join("\n")}

<h2>3. Cross-Task Analysis</h2>

<h3>3.1 Which Models Are Tone-Sensitive?</h3>

<table class="data-table">
  ${tbl("Average laziness delta (casual minus formal) by model across all tasks. Positive means casual prompts produced lazier output.")}
  <thead><tr><th>Model</th><th>Avg &Delta;(C-F)</th><th>Avg &Delta;(Ctrl-F)</th><th>Interpretation</th></tr></thead>
  <tbody>
  ${models.sort().map(model => {
    const modelResults = allResults.filter(r => r.config.model.label === model);
    const deltas: number[] = [];
    const ctrlDeltas: number[] = [];
    for (const task of tasks) {
      const c = modelResults.find(r => r.config.task === task && r.config.tone === "casual");
      const ctrl = modelResults.find(r => r.config.task === task && r.config.tone === "controlled");
      const f = modelResults.find(r => r.config.task === task && r.config.tone === "formal");
      if (c && f) deltas.push(c.scores.laziness.lazinessIndex - f.scores.laziness.lazinessIndex);
      if (ctrl && f) ctrlDeltas.push(ctrl.scores.laziness.lazinessIndex - f.scores.laziness.lazinessIndex);
    }
    const avgD = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    const avgCtrl = ctrlDeltas.length > 0 ? ctrlDeltas.reduce((a, b) => a + b, 0) / ctrlDeltas.length : 0;
    let interp = "Minimal sensitivity";
    if (avgD > 0.05 && avgCtrl > 0.05) interp = "Sensitive to both tone and information content";
    else if (avgD > 0.05 && avgCtrl <= 0.05) interp = "Sensitive to information content, not pure tone";
    else if (avgD <= 0.05 && avgCtrl > 0.05) interp = "Sensitive to pure tone only";
    return `<tr><td>${esc(model)}</td><td class="${avgD > 0.05 ? "pos-delta" : ""}">${avgD > 0 ? "+" : ""}${avgD.toFixed(3)}</td><td class="${avgCtrl > 0.05 ? "pos-delta" : ""}">${avgCtrl > 0 ? "+" : ""}${avgCtrl.toFixed(3)}</td><td>${interp}</td></tr>`;
  }).join("\n")}
  </tbody>
</table>

<h3>3.2 Key Findings</h3>

<div class="finding">
  <strong>Finding 1: The effect is provider-dependent.</strong> Anthropic models (Opus, Haiku) show meaningful laziness deltas between casual and formal prompts on multiple tasks. OpenAI Codex models are largely insensitive to tone on copywriting and coding, though GPT-5.2 Codex shows sensitivity on file-sorting.
</div>

<div class="finding">
  <strong>Finding 2: Information content matters more than register.</strong> The biggest laziness gaps appear between authentic casual (less direction) and formal (more direction). The controlled condition — same information, casual tone — often narrows or closes this gap, suggesting models respond more to <em>what you ask for</em> than <em>how you ask</em>.
</div>

<div class="finding">
  <strong>Finding 3: Opus responds to register itself on complex tasks.</strong> On coding and file-sorting, Opus shows a gradient where controlled casual falls between authentic casual and formal — even though controlled carries the same directives as formal. This suggests that for complex multi-step tasks, the formal <em>presentation</em> (not just content) cues Opus to invest more effort.
</div>

<div class="finding">
  <strong>Finding 4: Task complexity modulates the effect.</strong> Copywriting (a single-shot creative task) shows different sensitivity patterns than coding or file-sorting (multi-step procedural tasks). Models that are insensitive on copywriting may still show tone effects on tasks requiring sustained tool use.
</div>

<h2>4. Limitations</h2>

<ul>
  <li><strong>Single trial per condition.</strong> Without multiple replications, we cannot distinguish true tone effects from run-to-run stochasticity. No temperature/seed control was applied.</li>
  <li><strong>Prompt asymmetry.</strong> Despite efforts to match information content between controlled and formal conditions, subtle differences in phrasing may still influence behavior (e.g., "don't skip anything" vs. "complete all aspects").</li>
  <li><strong>Step count as effort proxy.</strong> More steps does not necessarily mean better output. A model that takes 40 steps on verification chatter may produce the same quality as one that takes 10 focused steps.</li>
  <li><strong>Laziness index weights are arbitrary.</strong> The 40/30/20/10 weighting was chosen heuristically. Different weightings could change relative rankings.</li>
  <li><strong>No quality judgment.</strong> We measure effort (steps, words, tool calls) but not output quality. A model that writes less may still produce better copy, code, or organization.</li>
</ul>

<div class="footer">
  Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} &middot; ${allResults.length} unique runs across ${models.length} models &times; 3 tones &times; ${tasks.length} tasks &middot; formality-eval
</div>

</body>
</html>`;

writeFileSync(join(process.cwd(), "report.html"), html, "utf-8");
console.log(`Report written to report.html (${allResults.length} runs, ${triads.size} experiments)`);
