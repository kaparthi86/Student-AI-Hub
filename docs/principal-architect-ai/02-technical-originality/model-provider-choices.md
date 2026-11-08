# Model & Provider Choices

## Primary path

| Knob | Default / pattern | Role |
|------|-------------------|------|
| `HF_CHAT_URL` | `https://router.huggingface.co/v1/chat/completions` | OpenAI-compatible router |
| `HF_MODEL` | `deepseek-ai/DeepSeek-V4-Pro:fastest` (env-overridable) | Text + chat |
| `HF_MODEL_VISION` | optional Hub id with routing suffix | Image turns |
| Routing suffix | `:fastest`, `:groq`, etc. | Required by Inference Providers |

## Why Hugging Face Inference Providers

1. **Cost leverage** — open models; switch providers via suffix without rewriting the app.  
2. **Operational fit** — single token (`HF_API_TOKEN`) with Inference permissions.  
3. **Streaming** — SSE compatible with the coach UI stop/abort UX.  
4. **Student mission** — avoids locking the product identity to a closed consumer brand.

## Ancillary providers

| Capability | Providers | Notes |
|------------|-----------|-------|
| Live web | Tavily, Brave Search, Serper | First configured key wins path in code |
| Auth | Supabase + Google | Not an LLM vendor |
| Hosting | Render (`render.yaml`) | Cold start consideration on free tier |

## Selection rubric (Principal Architect)

| Criterion | Weight | DeepSeek-via-HF | Closed consumer API |
|-----------|--------|-----------------|---------------------|
| $/1M tokens flexibility | High | Strong | Weak–medium |
| Brand independence | High | Strong | Conflict with “My Student Coach” |
| Latency control | Medium | Good with cache + stream | Good |
| Vision option | Medium | Via `HF_MODEL_VISION` | Usually built-in |
| Compliance storytelling | Medium | Open-weight narrative | Vendor DPA dependent |

## Change control

Model changes are **env-first** when possible. Document any default ID change in release notes and re-run cost before/after spreadsheet.
