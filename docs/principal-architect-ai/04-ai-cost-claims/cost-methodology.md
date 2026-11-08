# AI Cost Claims — Methodology

## Principle

Cost claims for interviews or boards must be **reproducible**: invoice → usage export → calculation sheet → architecture lever (cache, max_tokens, model).

## Sources of truth

| Artifact | Where it comes from | Stored in git? |
|----------|---------------------|----------------|
| Provider invoices | Hugging Face billing PDF/CSV | **No** (sensitive) — store path in checklist |
| Usage export | HF usage dashboard / API | Template CSV only |
| Cache logs | Server logs when `HF_LOG_PROMPT_CACHE_USAGE` enabled; completion cache hit counters | Aggregate stats OK |
| Calculation spreadsheet | `cost-model.csv` + your filled copy | Template yes; filled copy optional/private |
| Before/after | Same workload scripted against two configs | Yes (methodology + sample) |

## Unit economics model

```
Monthly_AI_cost ≈ Σ ( prompt_tokens_i + completion_tokens_i ) × price_tier_i
Effective_cost_per_study_turn = Monthly_AI_cost / study_turns
Cache_savings = tokens_avoided_by_hits × price
Voice_savings ≈ (baseline_completion_tokens − voiceMode_completion_tokens) × voice_turns × price
```

## Architectural levers already shipped

1. **Completion response cache** — `HF_RESPONSE_CACHE_TTL_SEC`, `HF_RESPONSE_CACHE_MAX_ENTRIES`  
2. **Prompt-cache param forwarding** — `HF_FORWARD_PROMPT_CACHE_PARAMS`  
3. **Static Notebook system prefix** — prefix-cache friendly  
4. **voiceMode max_tokens ≈ 280** + short-reply instruction  
5. **Mode-specific max_tokens** — vision/notebook/live-web caps in `server.js`  
6. **Skip cache on live web** — correctness over thrift when freshness matters

## Claim language (safe)

- Prefer: “We designed X to reduce completion tokens / avoid repeat HF calls; measured on [date] with [export].”  
- Avoid: absolute savings percentages without the CSV attached.
