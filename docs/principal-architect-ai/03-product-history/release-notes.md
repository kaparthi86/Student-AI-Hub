# Release Notes

## 1.4.1 — 2026-11-08 — Safari Ask/Stop fix

- Declared `activeChatAbort` and `activeChatStopBtn` to fix Safari `Can't find variable: activeChatAbort`.
- Cache-bust `app.js`.

## 1.4.0 — 2026-11-08 — Android-simple + conversational Voice Tutor

- Bottom navigation: Home / Tutor / Learning / Profile.
- Learner profile prefs fed into chat prompts.
- Assistant response controls (explain simply, steps, example, quiz, regenerate).
- Stop generation on Ask streams.
- Voice Tutor: SSE stream, speak-early sentence TTS, auto-relisten, barge-in, `voiceMode` short answers.

## 1.3.x — 2026-11-06 — Simplify Coach UX

- Single Home surface, teal brand, Coach naming.
- Learn / Profile menus restored.
- Strip leftover `**` from model replies.
- One-screen Google login gateway (+ orphan markup fix).

## 1.2.0 — 2026-11-06 — P1 learning labs

- Voice, Vision, Flashcards, Math & Science, Focus Mode, Knowledge Gaps.

## 1.1.0 — 2026-11-06 — Coach Home

- Phase 1 dashboard as primary post-login orientation.

## 1.0.0 — 2026-11-06 — Student AI only

- Removed Finance/Budget AI from the Hub product path.
- Positioning: focused learning AI.

## Earlier 2026

- Auth hardening (Google login / `wireSearchFlow`).
- Hub return-home behavior.
- Experimental Privacy Agent and Neo Clouds (later removed from primary Hub).
- Practice loops and feedback mission work (Aug 2026).
