# Tickets / Backlog — Principal Architect evidence

Ticket IDs are portfolio-stable references. Link each to a GitHub PR or issue when filing in production trackers.

## Epic A — Product ownership & launch

| ID | Title | Type | Status | Linked work |
|----|-------|------|--------|-------------|
| MSC-101 | PRD for My Student Coach public wedge | Spec | Done | `PRD-my-student-coach.md` |
| MSC-102 | Kill Finance AI from Hub | Scope | Done | PR #64 |
| MSC-103 | One-screen Google login gateway | UX | Done | PR #73 |
| MSC-104 | Privacy / Terms / nonprofit disclaimer parity | Legal UX | Done | legal pages + login copy |
| MSC-105 | Public launch checklist on Render + custom domain | Launch | Done | README deploy section |
| MSC-106 | Weekly feedback review ritual | Ops | Open | `supabase/feedback_weekly_review.sql` |

## Epic B — Learning quality

| ID | Title | Type | Status | Linked work |
|----|-------|------|--------|-------------|
| MSC-201 | Response contracts for Ask / Code / Notebook | Prompt eng | Done | `server.js` contracts |
| MSC-202 | Strip leftover `**` from model replies | Quality | Done | PR #72 |
| MSC-203 | Explain / Guide / Quiz study modes + honor code | Feature | Done | chat studyMode |
| MSC-204 | Assistant controls: simpler / steps / example / quiz / regen | Feature | Done | PR #74 |
| MSC-205 | Learner profile injected into system prompt | Personalization | Done | PR #74 |
| MSC-206 | Live web grounding with source chips | Feature | Done | Tavily/Brave/Serper |

## Epic C — Platform & mobile

| ID | Title | Type | Status | Linked work |
|----|-------|------|--------|-------------|
| MSC-301 | Coach Home Phase 1 | Feature | Done | PR #68 |
| MSC-302 | P1 labs (Voice, Vision, Cards, Math, Focus, Gaps) | Feature | Done | PR #69 |
| MSC-303 | Android-simple bottom nav | Feature | Done | PR #74 |
| MSC-304 | Conversational Voice Tutor loop | Feature | Done | PR #74 |
| MSC-305 | Fix Safari undeclared `activeChatAbort` | Bug | Done | PR #75 |
| MSC-306 | TWA Play packaging | Infra | Open | — |

## Epic D — Cost & reliability

| ID | Title | Type | Status | Linked work |
|----|-------|------|--------|-------------|
| MSC-401 | Response completion cache (TTL + max entries) | Cost | Done | `HF_RESPONSE_CACHE_*` |
| MSC-402 | Prompt-cache parameter forwarding | Cost | Done | `HF_FORWARD_PROMPT_CACHE_PARAMS` |
| MSC-403 | voiceMode short replies + 280 max tokens | Cost/UX | Done | PR #74 |
| MSC-404 | Export monthly HF invoice + usage CSV into evidence pack | Ops | Open | `04-ai-cost-claims/` |
| MSC-405 | Cache hit-rate log dashboard | Observability | Open | `HF_LOG_PROMPT_CACHE_USAGE` |

## Weekly operating ticket template

```
Title: Feedback week of YYYY-MM-DD
1. Pull GET /api/feedback-summary?days=7
2. Top 2 (reason, mode) pairs
3. One contract or UX change
4. Ship PR; note before/after thumbs in adoption pack
```
