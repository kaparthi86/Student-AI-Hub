# P0 Engineering Implementation Pack (Nov 13, 2026 audit)

## Foundations shipped in this branch

| Item | Status | Where |
| --- | --- | --- |
| Centralized student profiles (Supabase + hydrate) | Done | `GET/PUT /api/analytics/profile`, `analytics.hydrateProfileFromServer`, Profile copy |
| Learning / workspace persistence | Existing + RLS harden | `/api/workspace`, `supabase/user_workspace*.sql` |
| Analytics events + consent disclosure | Done | `lib/analytics.js`, Settings consent, `privacy.html` |
| Account & data deletion | Done | `POST /api/account/delete`, Settings UI, `lib/account-delete.js` |
| Age safeguards (13+) | Done | Login note, age gate modal, onboarding checkbox, privacy/terms |
| Support ticket IDs | Done | Support API returns `ticketId` (`MSC-*`), email subject includes ticket |
| Security smoke | Done | `scripts/p0-security-smoke.js`, `docs/p0-launch-security-tests.md` |

## Operator steps after merge

1. Run `supabase/user_workspace_rls_harden.sql` in Supabase SQL Editor (if workspace table already existed).
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set only on the server (Render), never in `public/config.js`.
3. Deploy and run `node scripts/p0-security-smoke.js`.
4. Execute the manual isolation matrix in `docs/p0-launch-security-tests.md`.
5. Spot-check: sign in on two devices → Profile syncs; submit Support → ticket ID shown; Delete account requires `DELETE` and signs out.

## Deferred (P1 per audit — do not block if removed from launch promises)

- Study Planner polish / exam prep expansions
- Advanced admin cohort analytics UI
- Proactive AI recommendation engine

## Unified identity note

Profiles, workspace, learning activity, analytics events, and support rows all key off the authenticated Supabase `user_id`. Keep that as the single student identity for future tools.
