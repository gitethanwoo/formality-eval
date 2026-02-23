# Additional Analyses to Mine from Eval Data

## Narrative Summary

The paper story shifts from "formal is better" to something much more nuanced:

**Formal prompts make models work harder and spend more, for marginal quality gains that only materialize in strong models.**

| # | Finding | Implication |
|---|---------|------------|
| 1 | Formal prompts **double token cost** (+92%) for +1.8% quality | Quality gain may be a compute artifact |
| 2 | Casual is **71% more token-efficient** (3,073 vs 1,799 quality/Mtok) | Cost-sensitive users should use casual |
| 3 | Formal is the **least consistent** tone (highest CV) | Controlled is most reliable |
| 4 | Tone sensitivity **scales with model capability** (r=0.98) | Only top-tier models benefit from formal |
| 5 | Tone **changes what metrics predict quality** | Verbosity hurts casual but not formal |
| 6 | Formal induces **more steps but less dense** iteration | Process changes, not just output |
| 7 | Formal produces **68% more output** but 92% more total tokens | Overhead goes to reasoning, not output |

The real actionable finding is that **controlled tone** (casual register, complete information) gives you nearly formal-level quality at casual-level cost. Information completeness matters more than politeness.

---

## Detailed Findings

### 1. Effort/Cost by Tone
Do models burn more tokens or take more steps when given formal prompts? If formal prompts get better quality AND the model uses more tokens, the improvement might just be "more compute = better output." If quality goes up but effort stays flat, that's a much stronger finding.

**Finding:** Formal prompts nearly DOUBLE token consumption (+92.3%, from 150K to 289K mean tokens) while only improving quality by ~1.8%. Steps increase 37.7%, tool calls 33.7%. The effect is most dramatic for copywriting (6x token increase casual→formal) and for Haiku (320K→682K tokens). This strongly suggests the quality improvement is at least partly an artifact of increased compute, not a free lunch from better prompt framing.

### 2. Quality-per-Token Efficiency
Composite score divided by tokens consumed. Does formal give you better ROI or just more expensive results?

**Finding:** Casual is dramatically more efficient: 3,073 quality-points-per-million-tokens vs 1,799 for formal. The ~2 percentage point quality gain from formal costs nearly double the tokens. This holds across every model and task. If you're optimizing for cost-efficiency rather than absolute quality, casual prompts are the clear winner.

### 3. Consistency/Variance by Tone
Is formal more reliable (lower variance)? A prompt style that produces 75% consistently might be preferable to one that swings between 60% and 90%.

**Finding:** Controlled is the most consistent tone (CV=0.178), not formal (CV=0.193). Formal actually has the *highest* coefficient of variation — it's the least predictable. This varies by task: formal is most consistent for coding (CV=0.116), but least consistent for file-sorting (CV=0.177). Teams prioritizing predictable output quality should use the controlled tone.

### 4. Model Capability vs Tone Sensitivity Interaction
Do the models that are already "better" benefit more or less from formal prompts? (Rising tide vs diminishing returns)

**Finding:** Near-perfect linear relationship (r=0.98) between model strength and tone sensitivity. Opus (strongest, +5.0% formal delta) benefits most; Haiku and Codex Mini (weakest) are essentially tone-insensitive (~0%). This suggests tone sensitivity is a marker of model sophistication — stronger models better extract signal from well-structured prompts, while weaker models lack the capacity to leverage the additional structure.

### 5. Automated vs Judge Score Correlation by Tone
Does the judge's qualitative assessment track the structural metrics differently across tones? E.g., does a formal prompt produce code with fewer LOC but higher judge quality (more concise = better)?

**Finding:** Tone changes the relationship between quantity and quality. For copywriting, word count is *negatively* correlated with judge quality — but this is strongest for casual (r=-0.467) and negligible for formal (r=-0.095). Formal tone decouples verbosity from quality; casual responses that are wordy tend to be judged worse. For coding, LOC correlates most strongly with quality under controlled (r=0.697) but weakly under casual (r=0.361). The structural metrics don't predict quality consistently across tones.

### 6. Step Count Patterns
Do formal prompts lead to more iterative refinement loops? More tool calls per step? Does the model's *process* change, not just the output?

**Finding:** Formal prompts increase steps by 37.7% (12.3→17.0 mean) but tool-calls-per-step actually *decreases* (1.29→1.08). Formal induces a more measured, step-by-step approach rather than dense multi-tool bursts. Copywriting shows this most clearly: formal nearly doubles step count (4.6→7.9) while TC/step drops from 1.90→1.33. GPT-5.2 Codex is the exception — formal actually produces fewer steps than casual for that model.

### 7. Output Volume by Tone
Word count / LOC / file count. Do casual prompts produce lazier, shorter outputs?

**Finding:** Formal prompts produce 68% more artifact content (31K vs 18K chars) and 66% more output tokens. But total token consumption increases 92% — meaning the extra effort disproportionately goes into reasoning/input overhead, not proportionally more output. Strongly model-dependent: Haiku doubles output volume (43K→85K chars) while GPT-5.2 Codex barely changes (7.7K→8.0K).
