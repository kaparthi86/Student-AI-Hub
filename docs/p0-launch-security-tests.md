# P0 launch security & isolation tests

Mandatory verification before public launch (from the Nov 13, 2026 audit). Run after deploying schema + RLS.

## Automated (repo)

```bash
node scripts/p0-security-smoke.js
```

Checks static gates: no service-role in frontend, `requireSession` on sensitive routes, account deletion + ticket IDs, workspace revoke, privacy disclosure, profile copy.

## Manual / staging matrix

| Test | Expected |
| --- | --- |
| User A opens User B conversation / workspace by forging IDs | Denied (server uses session user id only) |
| User A reads User B notebook payload via `/api/workspace` | Denied / only own row |
| Unauthenticated `POST /api/ai`, `/api/chat`, `/api/support`, `/api/analytics/*` | `401` |
| Request with modified JWT `sub` / spoofed user id body | Rejected; body user id ignored |
| `SUPABASE_SERVICE_ROLE_KEY` in browser bundle / `public/config.js` | Must not exist |
| Burst AI requests from one session | Rate-limited |
| Malicious notebook upload (exe / oversized / empty) | Rejected or safely processed |
| Expired session token | `401` / re-auth |
| Settings → Delete account (`DELETE`) | Profile, workspace, learning, analytics, feedback rows removed; auth user deleted |
| Admin analytics (`/api/analytics/dashboard`) | Only allowlisted admins |

## Supabase SQL to apply (if not already)

1. `supabase/student_intelligence.sql` (profiles, events, consent, RLS revoke pattern)
2. `supabase/user_workspace.sql` or `supabase/user_workspace_rls_harden.sql`
3. `supabase/assistant_feedback.sql`

Server writes use `SUPABASE_SERVICE_ROLE_KEY`. Client roles must remain revoked on these tables.
