# Live OpenAI Voice (cost-effective)

Optional true live voice for Voice Tutor using **`gpt-realtime-2.1-mini`**.

## Cost controls (defaults)

| Control | Default | Purpose |
|---------|---------|---------|
| Model | `gpt-realtime-2.1-mini` | Cheapest OpenAI realtime tier |
| Daily minutes / user | 10 | Soft launch budget |
| Max session | 8 minutes | Stops runaway mic-open sessions |
| Browser coach | Always available | Free fallback |
| Reserve + settle | Yes | Unused reserved time is refunded |

Rough API cost: about **$0.03–0.05 per minute of speech** on mini (varies with talk ratio).

## Setup

1. Set `OPENAI_API_KEY` on the server (Render / `.env`).
2. Leave `OPENAI_REALTIME_ENABLED=1` (auto-on when key is present) or set explicitly.
3. Optional: `REALTIME_DAILY_MINUTES=10`, `REALTIME_MAX_SESSION_SECONDS=480`.
4. Redeploy. Check `/api/health` → `openaiRealtimeConfigured: true`.

## Product UX

Voice Tutor → **Live OpenAI mini (cost-capped)** → Start conversation.  
Quota line shows remaining daily time. When exhausted, students use **Browser coach (free)**.

## Security

- API key stays on the server.
- Browser receives a short-lived ephemeral client secret only.
- Usage is attributed with a hashed safety identifier per user.
