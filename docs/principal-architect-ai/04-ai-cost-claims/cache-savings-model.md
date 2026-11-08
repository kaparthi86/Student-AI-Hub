# Cache & Voice Savings Model

## Completion cache (illustrative math)

Replace bracketed numbers with your export.

| Metric | Symbol | Example (SAMPLE — replace) |
|--------|--------|------------------------------|
| Ask turns / month | T | [[T=12000]] |
| Repeat hash hit rate | H | [[H=0.18]] |
| Avg tokens / turn (prompt+completion) | K | [[K=900]] |
| Price / 1M tokens | P | [[P=USD_x]] |
| Avoided tokens | T×H×K | — |
| Monthly cache savings | avoided × P / 1e6 | — |

## Voice mode (illustrative)

| Metric | Baseline Ask | Voice mode | Notes |
|--------|--------------|------------|-------|
| Target answer length | ~180 words | ~80 words | Prompt contract |
| max_tokens cap | up to ~720 | ~280 | `server.js` |
| Expected completion token ratio | 1.0 | ~0.35–0.55 | Measure; don’t invent |

## Before / after experiment protocol

1. Freeze model ID.  
2. Run 30 scripted prompts in Ask (no live web) with cache cold, then warm.  
3. Run 30 Voice Tutor prompts with `voiceMode`.  
4. Export token usage; fill `usage-export-template.csv`.  
5. Record results in `before-after-comparison.md`.

## SAMPLE narrative (label clearly when presenting)

> SAMPLE ONLY: If hit rate is 18% on 12k turns at 900 tokens and $0.50 / 1M tokens, avoided cost ≈ 12k × 0.18 × 900 / 1e6 × 0.50 ≈ $0.97 — small absolute dollars at prototype scale, but the **mechanism** is what scales with users. Replace with real invoice math.
