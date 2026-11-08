# ADR-003 — Server response cache + optional prompt-cache params

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026 |
| Code | `completionCacheGet/Set`, `HF_RESPONSE_CACHE_TTL_SEC`, `HF_FORWARD_PROMPT_CACHE_PARAMS` |

## Context

Repeated student questions (same mode + similar history) and notebook follow-ups burn tokens. Providers may also support prompt-prefix caching.

## Decision

1. Hash `(model, kind, userKey, messages)` and cache completed JSON/SSE payloads in-process with TTL + max entries.  
2. Skip cache for live-web turns (freshness).  
3. Optionally forward provider prompt-cache knobs when enabled.  
4. Prefer static system prefixes (Notebook static system) for prefix-cache friendliness.

## Consequences

- **+** Lower HF bill and latency on repeats  
- **+** Auditable via usage + hit logs for cost claims pack  
- **−** In-process cache does not share across multi-instance hosts (acceptable for MVP; Redis later)  
- **−** Stale answers if TTL too high — tune with `HF_RESPONSE_CACHE_TTL_SEC`
