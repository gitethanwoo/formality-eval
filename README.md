# formality-eval

Evaluate whether prompt formality changes model effort on practical tasks.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a local env file:
```bash
cp .env.example .env
```

3. Add API keys to `.env`:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## Run

Show CLI options:
```bash
npm run eval -- --help
```

Run full matrix:
```bash
npm run eval:all
```

Run a filtered eval:
```bash
npm run eval -- --model gpt-5.1-codex-mini --tone controlled --task copywriting --trials 1
```

## Validate

```bash
npm run typecheck
npm run verify
```

## Output

Raw run outputs are written under `results/<timestamp>/raw/*.json`.
Batch summary is written to `results/<timestamp>/summary.json`.
