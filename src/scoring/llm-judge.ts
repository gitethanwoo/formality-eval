// LLM-as-judge scoring is NOT run during the eval pipeline.
// Instead, artifacts are saved to results/ and judged afterward
// using `codex exec` with GPT-5.2 (uses OpenAI subscription, not API keys).
//
// To batch-judge results:
//   codex exec --model gpt-5.2 -p "Judge these artifacts..." --file results/...
export {};
