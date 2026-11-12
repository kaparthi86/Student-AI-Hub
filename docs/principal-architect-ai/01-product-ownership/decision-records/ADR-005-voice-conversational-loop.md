# ADR-005 — Continuous conversational Voice Tutor (warm coach)

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-11-12 |
| Evidence | `public/coach-labs.js`; `voiceMode` in `server.js`; prior PR #74 speak-early loop |

## Context

Turn-based “ask → wait → speak → tap again” feels like a walkie-talkie. Students need a patient personal coach: one tap starts a live session, natural pauses are allowed, the coach replies briefly, then listens again until the student ends the session.

## Decision

1. **Session model:** mic starts a live session; End session stops listening/speech.  
2. **Silence-aware turns:** accumulate speech; submit after a thinking pause (~1.7s), or sooner if the student taps while listening.  
3. **Auto-reliten:** after each spoken reply (and after barge-in), resume listening while the session is active.  
4. **Stream + speak-early:** `/api/chat` with `voiceMode: true`; speak sentence chunks as tokens arrive.  
5. **Barge-in:** mic tap aborts fetch + cancels speech, then listens.  
6. **Warm coach personality:** server voice instructions require supportive, non-authoritative spoken turns; soft TTS rate/pitch.  
7. **Optional OpenAI Realtime mini** (`gpt-realtime-2.1-mini`) behind daily/session caps for true live voice; Browser coach remains the free default/fallback.

## Consequences

- **+** Hands-free dialogue; fewer mic taps  
- **+** Coaching tone matches product identity  
- **+** Cost-gated path to true WebRTC live voice when `OPENAI_API_KEY` is set  
- **−** Browser SpeechRecognition silence windows still vary by device  
- **−** Without OpenAI Realtime, latency still includes LLM + browser TTS  

