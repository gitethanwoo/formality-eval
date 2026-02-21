# Execution Plan: Phase 2

## Current State
- 36 unique runs (4 models x 3 tones x 3 tasks), 1 trial each
- Automated scoring (steps, tools, words, tokens, laziness index) complete
- No quality judging, no replication, no statistical analysis

---

## Step 1: Replication (3 trials per condition)

**Goal:** 108 runs total (36 configs x 3 trials). Enough to report means, standard deviations, and spot outliers.

### Changes needed:
- Add `trial` field to `EvalRunConfig` and `EvalRunResult` types
- Update `run-eval.ts` to loop over trials with configurable `--trials N` flag
- Update `results/store.ts` to include trial number in filenames (e.g., `Claude-Haiku-4.5_casual_copywriting_t1.json`)
- Add rate-limit backoff: sequential runs per provider, parallel across providers (Anthropic and OpenAI can run simultaneously)
- Budget estimate before running: log estimated token cost per config based on trial-1 data

### Run strategy:
- Run OpenAI models first (cheaper, no rate limit issues at these volumes)
- Run Anthropic models sequentially per tone to avoid 450K/min input token limit
- Store all 108 result files, don't overwrite trial-1 data

### Estimated cost:
- Use trial-1 token counts to project: sum all `totalTokens` from existing runs, multiply by 3, apply per-model pricing
- Print this estimate before confirming the run

---

## Step 2: Blind Model-as-Judge

**Goal:** Quality scores (1-10) on every artifact set, blinded to condition.

### Design:
- Judge sees: the neutral task description + the produced artifacts
- Judge does NOT see: which tone produced them, the model name, or the prompt used
- Judge scores on 4 dimensions: quality, thoroughness, creativity, instruction adherence
- Judge provides free-text justification

### Implementation:
- Create `scripts/judge-batch.ts` that:
  1. Reads all result JSONs
  2. For each run, extracts artifacts and the neutral task description (identical across tones)
  3. Shuffles runs and assigns blind IDs (e.g., `run_A`, `run_B`) so judge can't infer condition from ordering
  4. Writes a judging prompt per run to `judge-inputs/` as individual files
  5. Shells out to `codex exec` for each (uses OpenAI subscription, not API keys)
  6. Parses judge responses and writes scores back to `judge-results/`

### Judging prompt template:
```
You are an expert evaluator. Score this work output on a 1-10 scale.

TASK DESCRIPTION:
{neutral task description — no tone framing}

PRODUCED ARTIFACTS:
{file contents, concatenated}

Score on:
- quality (1-10): Is the work good? Production-ready?
- thoroughness (1-10): Complete and detailed? All requirements addressed?
- creativity (1-10): Thoughtful, engaging, non-generic?
- adherenceToInstructions (1-10): Follows the specific requirements?

Return JSON: { quality, thoroughness, creativity, adherenceToInstructions, justification }
```

### Blinding protocol:
- Neutral task description = the raw requirements without any tone wrapper or suffix
- Artifacts are presented as-is (file names + contents)
- No metadata about model, tone, steps, tokens
- Runs are shuffled so the judge can't infer condition from order

### With replication:
- 108 runs x 1 judge call each = 108 codex exec calls
- Can parallelize (codex exec is subscription-based, no rate limit concern)

---

## Step 3: Analysis

**Goal:** Statistical analysis of replicated + judged data, updated report.

### Metrics to analyze:

**Effort metrics (from automated scoring):**
- Steps (mean, std across 3 trials)
- Tool calls
- Words output
- Tokens consumed
- Laziness index

**Quality metrics (from judge):**
- Quality, thoroughness, creativity, instruction adherence (mean, std)
- Composite quality score (average of 4 dimensions)

### Statistical tests:
- For each model x task: paired comparison of casual vs formal, casual vs controlled, controlled vs formal
- Report means ± std dev for each condition
- Flag results where all 3 trials agree on direction (consistent effect)
- Flag results where trials disagree (unreliable effect)
- No p-values with N=3 — instead, report effect sizes and consistency

### Visualizations (update report.html):
- Box plots or dot plots showing trial spread for each condition
- Effort vs quality scatter: does more effort (steps/tokens) correlate with higher judge scores?
- Heatmap: model x task grid colored by laziness delta
- Quality delta table: does casual produce worse quality, or just less effort?

### Key questions to answer:
1. Does casual prompting produce lower QUALITY output, or just less EFFORT? (effort metrics vs judge scores)
2. Is the effect driven by tone or by instruction specificity? (controlled vs formal comparison)
3. Which models are most sensitive? (cross-model comparison)
4. Which tasks are most sensitive? (cross-task comparison)
5. Is there a model that maintains quality despite reduced effort? (efficient vs lazy)

---

## Implementation Order

```
Phase 2a: Replication infrastructure
  - Update types (add trial field)
  - Update runner (--trials flag, rate limit backoff)
  - Update store (trial-aware filenames)
  - Dry run: estimate cost from trial-1 data
  - Run all 108 trials (OpenAI first, then Anthropic)

Phase 2b: Judging infrastructure
  - Create neutral task descriptions (stripped of tone)
  - Build judge-batch.ts (blind shuffling + codex exec)
  - Run judge on all 108 results
  - Parse and store judge scores

Phase 2c: Analysis
  - Aggregate replicated data (means, stds)
  - Merge judge scores with effort metrics
  - Statistical comparisons
  - Update report generator with new charts + findings
  - Regenerate report
```

## Estimated Timeline
- Phase 2a: ~1 hour implementation + ~2-3 hours running 108 trials
- Phase 2b: ~30 min implementation + ~1 hour running 108 judge calls
- Phase 2c: ~1-2 hours analysis + report update
