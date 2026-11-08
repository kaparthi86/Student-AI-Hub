# ADR-001 — Hugging Face Inference Providers (Router) as primary LLM path

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-05 (established) · reaffirmed 2026-11 |
| Deciders | Principal Architect / Founding engineer |

## Context

The product needs chat completions (streaming + JSON), optional vision, and cost control without operating GPUs.

## Decision

Use Hugging Face Router `https://router.huggingface.co/v1/chat/completions` with env-selected Hub model IDs that include a routing suffix (e.g. `deepseek-ai/DeepSeek-V4-Pro:fastest`). Optional `HF_MODEL_VISION` for image turns.

## Consequences

- **+** OpenAI-compatible payload shape; easy SSE streaming  
- **+** Provider flexibility via Hub routing suffixes (`:fastest`, `:groq`, …)  
- **+** Aligns with student/nonprofit cost posture  
- **−** Model availability depends on enabled Inference Providers  
- **−** Operational debugging for 401 / model_not_supported must be first-class (implemented in `server.js`)
