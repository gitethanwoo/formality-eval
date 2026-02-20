import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSystemPrompt, getTaskPrompt as getPrompt } from "../src/prompts/tones.js";
import type { EvalRunResult, TaskType, ToneStyle } from "../src/types.js";

// Collect all results
const resultsRoot = join(process.cwd(), "results");
const allResults: EvalRunResult[] = [];
for (const dir of readdirSync(resultsRoot).sort()) {
  const rawDir = join(resultsRoot, dir, "raw");
  try {
    for (const file of readdirSync(rawDir)) {
      if (file.endsWith(".json")) {
        allResults.push(JSON.parse(readFileSync(join(rawDir, file), "utf-8")));
      }
    }
  } catch { /* skip */ }
}
console.log(`Found ${allResults.length} results`);

// No raw prompts needed — getPrompt(task, tone) returns the correct version

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wordCount(artifacts: Record<string, string>, exclude: string[]): number {
  return Object.entries(artifacts)
    .filter(([k]) => !exclude.includes(k))
    .reduce((sum, [, v]) => sum + v.split(/\s+/).filter(Boolean).length, 0);
}

// Group into comparison pairs
interface Pair { casual?: EvalRunResult; formal?: EvalRunResult }
const pairs = new Map<string, Pair>();
for (const r of allResults) {
  const key = `${r.config.model.label}|||${r.config.task}`;
  if (!pairs.has(key)) pairs.set(key, {});
  pairs.get(key)![r.config.tone] = r;
}

let figNum = 0;
let tableNum = 0;

function figCaption(text: string): string {
  figNum++;
  return `<figcaption><strong>Figure ${figNum}.</strong> ${text}</figcaption>`;
}

function tblCaption(text: string): string {
  tableNum++;
  return `<caption><strong>Table ${tableNum}.</strong> ${text}</caption>`;
}

function barSvg(values: { label: string; value: number; color: string }[], maxVal: number, unit: string): string {
  const barH = 28;
  const gap = 6;
  const labelW = 80;
  const valueW = 90;
  const barW = 340;
  const totalH = values.length * (barH + gap);
  const rows = values.map((v, i) => {
    const y = i * (barH + gap);
    const w = maxVal > 0 ? (v.value / maxVal) * barW : 0;
    return `
      <text x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end" class="svg-label">${esc(v.label)}</text>
      <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${v.color}" opacity="0.85"/>
      <text x="${labelW + barW + 8}" y="${y + barH / 2 + 4}" class="svg-value">${v.value.toLocaleString()} ${unit}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${labelW + barW + valueW} ${totalH}" class="bar-chart">${rows}</svg>`;
}

function renderExperiment(key: string, pair: Pair): string {
  const [model, task] = key.split("|||");
  const taskType = task as TaskType;
  const seedFiles = ["brand-guide.md", "README.md"];
  const sections: string[] = [];

  // Section: Inputs (prompts)
  sections.push(`<h3>${esc(model)} — ${esc(task)}</h3>`);

  sections.push(`<p>Each run provides the model with a <em>system prompt</em> setting its persona, and a <em>user prompt</em> containing the task. The task content is identical between conditions; only the framing differs.</p>`);

  // Show prompts in a 2-column layout with clear labels
  const casualSys = getSystemPrompt("casual");
  const formalSys = getSystemPrompt("formal");
  const casualUser = getPrompt(taskType, "casual");
  const formalUser = getPrompt(taskType, "formal");

  sections.push(`
    <div class="prompt-comparison">
      <div class="prompt-condition">
        <div class="condition-label casual">Casual Condition</div>
        <div class="prompt-block">
          <div class="prompt-role">System Prompt</div>
          <pre class="prompt-text">${esc(casualSys)}</pre>
        </div>
        <div class="prompt-block">
          <div class="prompt-role">User Prompt <span class="dim">(${casualUser.length} chars)</span></div>
          <pre class="prompt-text">${esc(casualUser)}</pre>
        </div>
      </div>
      <div class="prompt-condition">
        <div class="condition-label formal">Formal Condition</div>
        <div class="prompt-block">
          <div class="prompt-role">System Prompt</div>
          <pre class="prompt-text">${esc(formalSys)}</pre>
        </div>
        <div class="prompt-block">
          <div class="prompt-role">User Prompt <span class="dim">(${formalUser.length} chars)</span></div>
          <pre class="prompt-text">${esc(formalUser)}</pre>
        </div>
      </div>
    </div>
  `);

  // Section: Quantitative results
  const c = pair.casual;
  const f = pair.formal;

  if (c && f) {
    const cWords = wordCount(c.artifacts, seedFiles);
    const fWords = wordCount(f.artifacts, seedFiles);

    sections.push(`<h4>Quantitative Results</h4>`);
    sections.push(`<figure>${barSvg([
      { label: "Casual", value: c.totalSteps, color: "#f97316" },
      { label: "Formal", value: f.totalSteps, color: "#3b82f6" },
    ], Math.max(c.totalSteps, f.totalSteps), "steps")}${figCaption(`Steps taken by ${esc(model)} on the ${esc(task)} task.`)}</figure>`);

    sections.push(`<figure>${barSvg([
      { label: "Casual", value: c.totalToolCalls, color: "#f97316" },
      { label: "Formal", value: f.totalToolCalls, color: "#3b82f6" },
    ], Math.max(c.totalToolCalls, f.totalToolCalls), "calls")}${figCaption(`Tool calls made by ${esc(model)} on the ${esc(task)} task.`)}</figure>`);

    sections.push(`<figure>${barSvg([
      { label: "Casual", value: cWords, color: "#f97316" },
      { label: "Formal", value: fWords, color: "#3b82f6" },
    ], Math.max(cWords, fWords), "words")}${figCaption(`Total words of output produced by ${esc(model)} on the ${esc(task)} task.`)}</figure>`);

    sections.push(`<figure>${barSvg([
      { label: "Casual", value: c.totalTokens, color: "#f97316" },
      { label: "Formal", value: f.totalTokens, color: "#3b82f6" },
    ], Math.max(c.totalTokens, f.totalTokens), "tokens")}${figCaption(`Total tokens consumed (input + output) by ${esc(model)} on the ${esc(task)} task.`)}</figure>`);

    // Laziness table
    sections.push(`
      <table class="data-table">
        ${tblCaption(`Laziness index decomposition for ${esc(model)} on the ${esc(task)} task. The composite index weights completeness (40%), step activity (30%), output volume (20%), and tool diversity (10%). Range 0–1; higher = lazier.`)}
        <thead><tr><th>Metric</th><th>Casual</th><th>Formal</th><th>&Delta;</th></tr></thead>
        <tbody>
          <tr><td>Steps</td><td>${c.totalSteps}</td><td>${f.totalSteps}</td><td>${c.totalSteps - f.totalSteps}</td></tr>
          <tr><td>Tool calls</td><td>${c.totalToolCalls}</td><td>${f.totalToolCalls}</td><td>${c.totalToolCalls - f.totalToolCalls}</td></tr>
          <tr><td>Words output</td><td>${cWords.toLocaleString()}</td><td>${fWords.toLocaleString()}</td><td>${(cWords - fWords).toLocaleString()}</td></tr>
          <tr><td>Tokens used</td><td>${c.totalTokens.toLocaleString()}</td><td>${f.totalTokens.toLocaleString()}</td><td>${(c.totalTokens - f.totalTokens).toLocaleString()}</td></tr>
          <tr><td>Completeness</td><td>${(c.scores.laziness.completenessRate * 100).toFixed(0)}%</td><td>${(f.scores.laziness.completenessRate * 100).toFixed(0)}%</td><td>${((c.scores.laziness.completenessRate - f.scores.laziness.completenessRate) * 100).toFixed(0)}pp</td></tr>
          <tr class="highlight-row"><td><strong>Laziness Index</strong></td><td><strong>${c.scores.laziness.lazinessIndex.toFixed(3)}</strong></td><td><strong>${f.scores.laziness.lazinessIndex.toFixed(3)}</strong></td><td><strong>${(c.scores.laziness.lazinessIndex - f.scores.laziness.lazinessIndex) > 0 ? "+" : ""}${(c.scores.laziness.lazinessIndex - f.scores.laziness.lazinessIndex).toFixed(3)}</strong></td></tr>
        </tbody>
      </table>
    `);
  } else {
    const available = c ?? f;
    if (available) {
      const words = wordCount(available.artifacts, seedFiles);
      sections.push(`<p><em>Only the ${available.config.tone} condition has been run so far.</em> Steps: ${available.totalSteps}, Tool calls: ${available.totalToolCalls}, Words: ${words.toLocaleString()}, Laziness: ${available.scores.laziness.lazinessIndex.toFixed(3)}.</p>`);
    }
  }

  // Section: Artifacts (output files)
  sections.push(`<h4>Produced Artifacts</h4>`);
  sections.push(`<p>The model was given sandboxed file tools and asked to write deliverables to disk. Below are the files it produced under each condition.</p>`);

  function renderArtifacts(result: EvalRunResult | undefined, tone: ToneStyle): string {
    if (!result) return `<p class="dim">Not yet run.</p>`;
    const files = Object.entries(result.artifacts).filter(([k]) => !seedFiles.includes(k));
    if (files.length === 0) return `<p class="dim">No files produced.</p>`;
    return files.map(([name, content]) => {
      const words = content.split(/\s+/).filter(Boolean).length;
      const preview = content.length > 1200 ? content.slice(0, 1200) + "\n\n[...truncated, " + (content.length - 1200) + " chars remaining]" : content;
      return `<details class="artifact-detail">
        <summary><code>${esc(name)}</code> &mdash; ${words} words</summary>
        <pre class="artifact-pre">${esc(preview)}</pre>
      </details>`;
    }).join("\n");
  }

  sections.push(`
    <div class="artifacts-comparison">
      <div class="artifacts-side">
        <div class="condition-label casual small">Casual Output</div>
        ${renderArtifacts(pair.casual, "casual")}
      </div>
      <div class="artifacts-side">
        <div class="condition-label formal small">Formal Output</div>
        ${renderArtifacts(pair.formal, "formal")}
      </div>
    </div>
  `);

  return `<section class="experiment">${sections.join("\n")}</section>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Formality and AI Effort: An Empirical Evaluation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
  <style>
    :root { --casual: #d97706; --formal: #2563eb; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 17px;
      line-height: 1.75;
      color: #1a1a1a;
      background: #fff;
      max-width: 960px;
      margin: 0 auto;
      padding: 3rem 2rem;
    }
    h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 0.3rem; line-height: 1.3; }
    h2 { font-size: 1.35rem; font-weight: 700; margin: 2.5rem 0 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid #ddd; }
    h3 { font-size: 1.15rem; font-weight: 700; margin: 2rem 0 0.6rem; }
    h4 { font-size: 1rem; font-weight: 700; margin: 1.5rem 0 0.5rem; }
    p { margin-bottom: 0.8rem; }
    a { color: var(--formal); }
    em { font-style: italic; }
    strong { font-weight: 700; }
    code { font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; font-size: 0.88em; background: #f5f5f5; padding: 0.1em 0.3em; border-radius: 3px; }
    .dim { color: #888; font-size: 0.9em; }
    .authors { color: #555; margin-bottom: 2rem; font-size: 0.95rem; }

    /* Abstract */
    .abstract { background: #f9f9f9; border-left: 3px solid #333; padding: 1rem 1.2rem; margin: 1.5rem 0; font-size: 0.95rem; }
    .abstract strong { display: block; margin-bottom: 0.3rem; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.08em; }

    /* Prompt comparison */
    .prompt-comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 1rem 0 1.5rem; }
    .prompt-condition { border: 1px solid #e0e0e0; border-radius: 4px; padding: 1rem; }
    .condition-label { font-family: -apple-system, system-ui, sans-serif; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 0.25rem 0.6rem; border-radius: 3px; margin-bottom: 0.8rem; display: inline-block; }
    .condition-label.casual { background: #fef3c7; color: #92400e; }
    .condition-label.formal { background: #dbeafe; color: #1e40af; }
    .condition-label.small { font-size: 0.7rem; margin-bottom: 0.5rem; }
    .prompt-block { margin-bottom: 0.8rem; }
    .prompt-role { font-family: -apple-system, system-ui, sans-serif; font-size: 0.75rem; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.2rem; }
    .prompt-text { font-family: 'SF Mono', 'Menlo', monospace; font-size: 0.78rem; line-height: 1.5; background: #fafafa; border: 1px solid #eee; border-radius: 3px; padding: 0.6rem 0.8rem; white-space: pre-wrap; word-break: break-word; max-height: 280px; overflow-y: auto; }

    /* Figures */
    figure { margin: 1.2rem 0; }
    figcaption { font-size: 0.85rem; color: #555; margin-top: 0.3rem; line-height: 1.4; }
    .bar-chart { width: 100%; max-width: 520px; display: block; }
    .svg-label { font-family: -apple-system, system-ui, sans-serif; font-size: 12px; fill: #555; }
    .svg-value { font-family: -apple-system, system-ui, sans-serif; font-size: 11px; fill: #333; font-weight: 600; }

    /* Tables */
    .data-table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-family: -apple-system, system-ui, sans-serif; font-size: 0.88rem; }
    .data-table caption { text-align: left; font-family: Georgia, serif; font-size: 0.85rem; color: #555; margin-bottom: 0.5rem; line-height: 1.4; }
    .data-table th { text-align: left; padding: 0.5rem 0.8rem; border-bottom: 2px solid #333; font-weight: 600; font-size: 0.8rem; }
    .data-table td { padding: 0.45rem 0.8rem; border-bottom: 1px solid #e5e5e5; }
    .data-table .highlight-row td { border-top: 2px solid #333; border-bottom: 2px solid #333; background: #f9f9f9; }

    /* Artifacts */
    .artifacts-comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 0.8rem 0 1.5rem; }
    .artifacts-side { min-width: 0; }
    .artifact-detail { margin-bottom: 0.4rem; }
    .artifact-detail summary { cursor: pointer; font-family: -apple-system, system-ui, sans-serif; font-size: 0.85rem; padding: 0.3rem 0; }
    .artifact-detail summary:hover { color: var(--formal); }
    .artifact-pre { font-family: 'SF Mono', 'Menlo', monospace; font-size: 0.75rem; line-height: 1.45; background: #fafafa; border: 1px solid #eee; border-radius: 3px; padding: 0.6rem 0.8rem; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; margin: 0.3rem 0 0.5rem; }

    /* Experiment sections */
    .experiment { margin: 2rem 0; padding-bottom: 2rem; border-bottom: 1px solid #eee; }
    .experiment:last-child { border-bottom: none; }

    /* Summary table */
    .summary-table { width: 100%; border-collapse: collapse; font-family: -apple-system, system-ui, sans-serif; font-size: 0.85rem; margin: 1rem 0; }
    .summary-table th { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 2px solid #333; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #e5e5e5; }

    /* Footer */
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #ddd; color: #888; font-size: 0.8rem; }

    @media (max-width: 700px) {
      .prompt-comparison, .artifacts-comparison { grid-template-columns: 1fr; }
      body { padding: 1.5rem 1rem; font-size: 16px; }
    }
  </style>
</head>
<body>

<h1>Does Prompt Formality Affect AI Effort?</h1>
<p class="authors">An empirical evaluation of prompt style on model output thoroughness</p>

<div class="abstract">
  <strong>Abstract</strong>
  We evaluate whether the linguistic register of a prompt — casual, Gen Z-inflected language versus formal, professional language — affects the thoroughness and volume of AI model outputs on identical tasks. Each model receives the same task information under two conditions: a <em>casual</em> framing (lowercase, no punctuation, colloquial language) and a <em>formal</em> framing (proper grammar, explicit quality expectations). Models are given sandboxed tools (file I/O, bash execution) and up to 25 agentic steps. We measure step count, tool calls, output word count, token consumption, and a composite laziness index. Early results suggest that casual prompts produce substantially less output from the same model on the same task.
</div>

<h2>1. Methodology</h2>

<p>We construct an evaluation matrix of <strong>${allResults.length > 0 ? [...new Set(allResults.map(r => r.config.model.label))].length : 4} models</strong> &times; <strong>2 tones</strong> &times; <strong>3 tasks</strong>. Each run provisions a fresh sandboxed environment (via <code>bash-tool</code> + <code>just-bash</code>, an in-memory virtual filesystem) pre-loaded with task-specific seed files. The model receives four tools:</p>

<ol style="margin: 0.5rem 0 1rem 1.5rem;">
  <li><code>bash</code> — execute shell commands in the sandbox</li>
  <li><code>readFile</code> — read a file from the working directory</li>
  <li><code>writeFile</code> — write a file to the working directory</li>
</ol>

<p>The model may take up to 25 steps (LLM calls). We record every step's tool calls, text output, and token usage. After the run, we score the sandbox state with automated metrics and compute a composite laziness index:</p>

<p style="text-align:center;font-family:-apple-system,system-ui,sans-serif;font-size:0.95rem;margin:1rem 0;">
  <em>L</em> = 0.4(1 &minus; completeness) + 0.3(1 &minus; steps/20) + 0.2(1 &minus; volume/expected) + 0.1(1 &minus; tools_used/4)
</p>

<p>where <em>L</em> &isin; [0, 1] and higher values indicate lazier behavior. Completeness is task-specific: deliverable count for copywriting, test pass rate for coding, sort accuracy for file organization.</p>

<h3>1.1 Independent Variable: Prompt Tone</h3>

<p>The independent variable is the <em>framing</em> of the prompt. The task content — the actual requirements, deliverables, and constraints — is identical between conditions. Only two things change:</p>

<ol style="margin: 0.5rem 0 1rem 1.5rem;">
  <li><strong>System prompt:</strong> Sets the model's persona (relaxed vs. professional).</li>
  <li><strong>User prompt wrapper:</strong> The casual condition lowercases the text and strips periods; the formal condition appends explicit completeness instructions.</li>
</ol>

<h2>2. Results</h2>

${allResults.length > 0 ? `
<table class="summary-table">
  ${tblCaption("Summary of all completed runs.")}
  <thead><tr><th>Model</th><th>Tone</th><th>Task</th><th>Steps</th><th>Tool Calls</th><th>Words</th><th>Tokens</th><th>Laziness</th><th>Complete</th></tr></thead>
  <tbody>
  ${allResults
    .sort((a, b) => `${a.config.model.label}${a.config.task}${a.config.tone}`.localeCompare(`${b.config.model.label}${b.config.task}${b.config.tone}`))
    .map(r => {
      const seedFiles = ["brand-guide.md", "README.md"];
      const words = wordCount(r.artifacts, seedFiles);
      return `<tr>
        <td>${esc(r.config.model.label)}</td>
        <td><span class="condition-label ${r.config.tone} small">${r.config.tone}</span></td>
        <td>${esc(r.config.task)}</td>
        <td>${r.totalSteps}</td>
        <td>${r.totalToolCalls}</td>
        <td>${words.toLocaleString()}</td>
        <td>${r.totalTokens.toLocaleString()}</td>
        <td><strong>${r.scores.laziness.lazinessIndex.toFixed(3)}</strong></td>
        <td>${(r.scores.laziness.completenessRate * 100).toFixed(0)}%</td>
      </tr>`;
    }).join("\n")}
  </tbody>
</table>` : "<p><em>No results yet.</em></p>"}

${[...pairs.entries()].map(([key, pair]) => renderExperiment(key, pair)).join("\n")}

<h2>3. Discussion</h2>

<p>Results will be analyzed here once more runs are complete. Preliminary findings from the copywriting task suggest a strong effect of prompt formality on output volume and step count, even when task content is held constant.</p>

<div class="footer">
  Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} &middot; ${allResults.length} runs &middot; formality-eval
</div>

</body>
</html>`;

writeFileSync(join(process.cwd(), "report.html"), html, "utf-8");
console.log(`Report written to report.html (${allResults.length} runs, ${pairs.size} comparisons)`);
