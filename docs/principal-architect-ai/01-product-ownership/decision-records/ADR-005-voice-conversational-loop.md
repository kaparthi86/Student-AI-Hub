# ADR-005 — Almost-conversational Voice Tutor (stream + speak-early)

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-11-08 |
| Evidence | PR #74; `public/coach-labs.js`; `voiceMode` in `server.js` |

## Context

Turn-based “listen → wait for full answer → speak all” feels like a walkie-talkie, not a tutor.

## Decision

1. Stream `/api/chat` with `voiceMode: true`.  
2. Speak sentence boundaries as tokens arrive.  
3. Auto-relisten after TTS when enabled.  
4. Barge-in: mic tap aborts fetch + cancels speech.  
5. Cap spoken length and server `max_tokens` (~280) for short replies.

## Consequences

- **+** Perceived latency drops dramatically  
- **+** Lower token spend vs long essay answers  
- **−** Sentence segmentation heuristics can mis-chunk abbreviations  
- **−** Not true full-duplex realtime; native path remains Later roadmap
