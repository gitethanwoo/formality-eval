# NEXT STEPS

## Current State (2026-02-21)
- Core eval runner is active and working.
- Matrix support exists across:
  - 4 models
  - 3 tones (`casual`, `controlled`, `formal`)
  - 3 tasks (`copywriting`, `coding`, `file-sorting`)
- Replication support exists via `--trials N`.
- Trial-aware result filenames are implemented (`..._t1.json`, `..._t2.json`, etc.).
- Provider concurrency is implemented (sequential Anthropic, parallel OpenAI by default).
- Pre-run token estimation is implemented for multi-trial batches (uses prior trial-1 baselines from `results/`).
- Batch run metadata is persisted to `run-manifest.json`.
- Failed runs are persisted to `failures.json`, and batch execution exits non-zero when failures occur.

## Out Of Scope (Deferred)
- Blind model-as-judge pipeline
- Judge score aggregation
- Statistical analysis/reporting phase

These are intentionally deferred for now.

## Remaining Work
1. Add dollar-cost estimation (optional)
- Token estimation is live, but there is no committed model pricing table yet.
- Add a local pricing config if you want USD estimates in pre-run output.

2. Improve scoring fidelity
- Coding scoring now reports pass metrics only when tests are executable in sandbox runtime.
- File-sorting scoring now validates exact filename-to-path placement against `tasks/file-sorting/expected/manifest.json`.
- Copywriting scoring remains structural (deliverable presence + word count) and does not score quality.

3. Keep script hygiene enforced
- All scripts are now typechecked via `tsconfig.json` include rules.
- Continue removing stale scripts instead of keeping broken debug-only utilities.

## Quick Verification Commands
```bash
npm run typecheck
npm run eval -- --help
npm run eval -- --model gpt-5.1-codex-mini --tone controlled --task copywriting --trials 1
```

## Notes
- If you choose to reintroduce reporting later, build it from the current result schema:
  - `scores` now stores task-specific automated metrics directly (no `scores.laziness` object).
  - `config.trial` is present in new run outputs.
