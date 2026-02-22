# Paper Outline: Does Prompt Formality Affect LLM Output Quality?

## Format
Interactive HTML report (blog-ready). Same aesthetic as the current Grace Report-style
report but restructured as a narrative paper with progressive findings.

---

## 1. HEADLINE / HERO

**Title options (pick one):**
- "Formal Prompts Cost 2x for 1.8% Better Output"
- "Does It Matter How You Talk to AI?"
- "The Formality Tax: What Prompt Register Actually Does to LLM Output"
- "lol make me a marketing campaign: Prompt Formality vs. Output Quality"

**Subtitle:** We ran 190 blind evaluations across 4 models, 3 tones, and 3 tasks.
The answer is more complicated — and more interesting — than you'd expect.

**Design:** Departure Mono title, Source Serif subtitle. Three headline metric cards:
- +1.8% quality gain (formal vs casual)
- +92% token cost increase
- r=0.98 correlation between model strength and tone sensitivity

These three numbers in tension immediately signal "this is not a simple answer."

---

## 2. THE QUESTION (short, 2-3 paragraphs)

There's a generational divide in how people talk to AI. Some write structured,
professional prompts with explicit requirements and quality bars. Others type
the way they'd text a friend — terse, lowercase, minimal punctuation, vibes over
specifications. It's not about politeness ("please" and "thank you") — it's about
grammatical register. Gen-Z shorthand vs. millennial corporate email.

Prior work (cite Yin 2024, Cai 2025, EmotionPrompt) has tested politeness effects
on MCQ benchmarks — accuracy on multiple choice questions. But nobody has tested
the register/formality spectrum on the kind of work people actually use AI for:
writing marketing copy, building software, organizing files. Agentic, multi-step,
generative tasks where the model uses tools and iterates.

We designed an experiment to find out. The twist: we added a third condition between
casual and formal — "controlled" — which has the same informational content as formal
but written in a casual register. This lets us separate two things that formal prompts
change simultaneously: (a) the grammatical register/formality and (b) the
specificity/completeness of the instructions.

---

## 3. EXPERIMENTAL DESIGN

**Design:** Clean diagram/table showing the matrix.

### 3.1 The Matrix
- **4 models:** Claude Opus 4.6, Claude Haiku 4.5, GPT-5.2 Codex, GPT-5.1 Codex Mini
  (2 large, 2 small — deliberate tier pairing)
- **3 tones:** casual, controlled, formal
- **3 tasks:** copywriting, coding, file-sorting
- **5 trials per cell** → 180 target runs (190 actual due to partial extra batch)

### 3.2 The Three Tones
Show a concrete side-by-side example of the same task in all 3 tones.
Key point: controlled has IDENTICAL information to formal but casual register.
This is our methodological contribution — prior work conflates register with specificity.

Pull actual prompt excerpts from `src/prompts/` for one task (copywriting is most
illustrative). Keep it short — 3-4 lines per tone, enough to see the difference.

### 3.3 The Tasks
Brief description of each. Emphasize these are agentic tasks (models use tools,
write files, iterate) not just text-in/text-out. This is novel vs prior work.

### 3.4 Blind Judge Protocol
- Kimi K2.5 via OpenRouter (different model family — avoids self-enhancement bias)
- Judge sees ONLY: neutral task description + output artifacts
- Judge does NOT see: model name, tone, trial number, original prompt, token counts
- Four dimensions: quality, thoroughness, creativity, adherence to instructions
- 0-100% scale
- Acknowledge: single judge, 1-10 underlying scale (cite grading scale paper),
  comparative analysis mitigates absolute calibration concerns

**Design notes:** This section should feel rigorous but not boring. Use a visual
diagram for the blinding protocol. Maybe a flowchart: prompt → model → artifacts →
[blind wall] → judge sees only neutral description + artifacts → scores.

---

## 4. FINDINGS (progressive revelation — this is the core)

### 4.1 The Surface Finding: Formal Scores Higher
**Chart:** Grouped bar chart — composite by tone (the current headline chart)

Formal prompts score 1.8% higher than casual (74.1% vs 72.3%). Controlled
is in between (74.9%). This is consistent with prior work (Cai et al. found
+3.1% on humanities tasks).

Throughness drives the effect (+3.5%). Creativity is completely flat (+0.0%).
Quality and adherence show small gains (~+1.7-1.9%).

**Chart:** Dimension breakdown horizontal bars (current FIG.005)

Takeaway text: "At first glance, formal works better. But this is the least
interesting finding in this paper."

### 4.2 It's Information, Not Politeness
**Chart:** Tone × Task grouped bars (current FIG.006)

Controlled ≈ formal across all tasks. The controlled tone has the same info
as formal but casual register. This means the quality gain comes from
informational completeness (more specific requirements, explicit quality bars)
not from politeness or professional language.

This is the study's methodological contribution. Prior work couldn't
distinguish these because they only compared polite vs rude, without
controlling for information content.

### 4.3 The Cost: Formal Doubles Token Consumption
**Chart:** NEW — Token usage by tone (bar chart, same style)
**Chart:** NEW — Quality-per-million-tokens efficiency (bar chart)

Here's where it gets interesting. Formal prompts consume 92% more tokens
(150K → 289K mean). Steps increase 37.7%. Tool calls increase 33.7%.

Quality-per-token efficiency: casual delivers 3,073 quality points per
million tokens vs 1,799 for formal. Casual is 71% more efficient.

The 1.8% quality gain isn't free — it costs double. This reframes the
finding entirely: formal prompts don't make models smarter, they make
models work harder.

### 4.4 Only Strong Models Benefit
**Chart:** NEW — Scatter plot or bar chart: model overall quality vs formal-casual delta
**Table:** Effect size heatmap (current FIG.010)

The correlation between model capability and tone sensitivity is r=0.98.
- Opus (strongest): +5.0% formal benefit
- GPT-5.2 Codex: +2.2%
- GPT-5.1 Codex Mini: -0.1% (flat)
- Haiku (weakest): +0.2% (flat)

Small models are tone-deaf. They perform the same regardless of how you
ask. Strong models extract signal from well-structured prompts — tone
sensitivity appears to be a marker of model sophistication.

Tier breakdown: large models +3.6% formal delta, small models -0.05%.

### 4.5 Formal Changes the Process, Not Just the Output
**Chart:** NEW — Steps and tool-calls-per-step by tone

Formal prompts induce more iterative behavior: +37.7% more steps, but
tool-calls-per-step actually *decreases* (1.29 → 1.08). Models take a more
measured, step-by-step approach rather than dense multi-tool bursts.

For copywriting specifically: formal nearly doubles step count (4.6 → 7.9)
while TC/step drops from 1.90 → 1.33.

This suggests formal prompts don't just produce different output — they
change how the model reasons about the task. More deliberation, more
incremental refinement.

### 4.6 The Tails: Small Means, Bigger Extremes
**Chart:** Current quintile distribution or strip plot

At the >= 90% excellence threshold, formal produces nearly 2x the rate of
casual (19.7% vs 10.6%). The mean difference is small, but the probability
of an outstanding result roughly doubles.

However, formal doesn't protect against failure — poor result rates
(< 55%) are similar across tones (~8-9%).

Formal is a ceiling-raiser, not a floor-raiser.

---

## 5. IMPLICATIONS (what to actually do)

Three practical recommendations based on audience:

**If you're cost-sensitive:** Use casual prompts. 71% more efficient.
The quality gap is negligible for most use cases.

**If you're quality-maximizing with a strong model:** Use formal prompts,
but only if you're using a top-tier model (Opus-class). The 5% quality
gain on strong models is real, concentrated at the excellence tail, and
worth the 2x token cost if quality matters more than cost.

**The Goldilocks choice:** Use the controlled tone — complete information,
casual register. You get ~formal quality at ~casual cost. The finding that
matters most is that informational completeness drives quality, not
grammatical formality. Be specific about what you want, but write however
comes naturally. The professional email voice doesn't earn you anything
the bullet points didn't already cover.

---

## 6. THREATS TO VALIDITY

Honest, concise, paired with mitigations:

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Single LLM judge (Kimi K2.5) | Medium | Different model family avoids self-enhancement bias; comparative analysis (tone A vs B) is robust to consistent judge bias |
| 5 trials per cell | Medium | 190 total results; effects consistent directionally across models/tasks; expanded from 2-3 to 5 based on initial findings |
| 1-10 grading scale (ICC=0.805 vs 0.853 for 0-5) | Low | Comparative analysis; any scale bias affects all conditions equally |
| Prompt confounding | Low | Controlled condition directly tests this; casual vs formal differ in both register AND content, controlled isolates register |
| RLHF training confound | Medium | Cannot be eliminated; models are trained to respond to professional language; this is part of the real-world effect we're measuring |
| Token cost as confound | High | Addressed directly in 4.3; acknowledged that quality gain may be partly a compute artifact |

---

## 7. RELATED WORK (at the end, in context)

Brief positioning against:
- Yin et al. 2024 (politeness on MCQ — we extend to agentic tasks)
- Cai et al. 2025 (tone on MMLU — our +1.8% aligns with their +3.1%)
- EmotionPrompt (emotional stimulus — different mechanism, similar direction)
- Ma et al. 2025 (code stability — our coding results align)
- Grading scale paper 2026 (we acknowledge and argue comparative validity)

Frame as: prior work established tone effects on benchmarks. We extend to
agentic tasks, add the controlled condition to disentangle register from
content, and reveal the cost dimension that prior work ignores.

---

## APPENDIX (collapsible sections in HTML)

- Full prompt text for all 9 tone × task combinations
- Judge system prompt and neutral task descriptions
- Per-model, per-task, per-tone raw data tables
- All analysis scripts available at github.com/gitethanwoo/formality-eval

---

## BUILD INSTRUCTIONS

### Implementation approach
Rewrite `scripts/build-report.ts` to generate the paper-structured HTML report.
Keep the same Grace Report aesthetic (IBM Plex Mono, Source Serif, indigo accent,
FIG annotations, sharp edges, pure CSS charts) but restructure the content to
follow the outline above.

### New charts needed (not in current report)
1. **Token usage by tone** — 3 bars (casual/controlled/formal), y-axis = mean tokens
   Data source: raw eval results (`totalTokens`), joined by runId
2. **Quality-per-million-tokens** — 3 bars, y-axis = composite / (tokens / 1M)
   Data source: join judge scores with raw eval results
3. **Model capability vs tone delta** — 4 points or grouped bars showing each
   model's overall quality alongside its formal-casual delta
4. **Steps and TC/step by tone** — dual metric bars or paired bars
5. **Distribution strip/quintile chart** — already exists in current report concept

### Data loading
The current report only reads `combined.json` (judge scores). The new report needs
to also load raw eval results from `results/*/raw/*.json` for token counts, steps,
tool calls. Use the same discovery logic from `scripts/judge.ts`.

### Prompt examples
Read actual prompts from `src/prompts/copywriting.ts` (or hardcode excerpts) to
show the 3-tone comparison in section 3.2.

### Section structure in HTML
Each finding section (4.1-4.6) follows this pattern:
```html
<div class="section">
  <div class="section-header">
    <span class="section-title">FINDING TITLE</span>
    <span class="section-line"></span>
    <span class="section-annotation">FIG.XXX</span>
  </div>
  <p class="section-desc">1-2 sentence setup</p>
  <div class="chart-panel">
    <!-- chart here -->
  </div>
  <div class="insight-box">
    → Key takeaway in one sentence
  </div>
</div>
```

### Collapsible appendix
Use `<details><summary>` for appendix sections so they don't bloat the page.

### Tone examples
Style the 3-tone prompt comparison as a horizontal layout:
```
| CASUAL          | CONTROLLED       | FORMAL           |
| "hey make me.." | "make a campaign | "You are tasked   |
|                 |  that has..."    |  with producing.."|
```
Use a 3-column grid with each column having a tone-colored top border.
