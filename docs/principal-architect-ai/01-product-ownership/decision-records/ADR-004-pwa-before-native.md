# ADR-004 — PWA / Android-simple shell before native Kotlin

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-11 |
| Evidence | `android-shell.css`, bottom nav, webmanifest, PR #74 |

## Context

Play-ready presence is desirable, but a full Kotlin rewrite would freeze product learning velocity.

## Decision

Ship an **Android-simple web shell** (bottom nav Home / Tutor / Learning / Profile, large tap targets, conversational Voice Tutor on Web Speech APIs) and treat **TWA** as the Play packaging path. Defer native realtime voice and Kotlin UI until install/retention justify it.

## Consequences

- **+** One codebase; fast iteration  
- **−** Voice quality limited by browser STT/TTS  
- **−** Some Safari Web Speech gaps — document Chrome/Edge as best voice path
