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

## Out Of Scope (Deferred)
- Blind model-as-judge pipeline
- Judge score aggregation
- Statistical analysis/reporting phase

These are intentionally deferred for now.

## Remaining Work For Phase 2a (Eval Infra Hardening)
1. Add run cost estimation before execution
- Estimate projected token usage/cost before starting multi-trial runs.
- Use existing results as baseline when available.

2. Improve failure handling in batch runs
- Persist a machine-readable failure log for failed runs.
- Exit non-zero when any run fails (or add explicit `--allow-failures` behavior).

3. Add a run manifest
- Write one manifest per batch with:
  - run start time
  - filters used (models/tones/tasks/trials)
  - expected run count
  - completed run count
  - failed run count

4. Keep script hygiene enforced
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
