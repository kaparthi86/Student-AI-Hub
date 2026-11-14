# Sprint 1 — Security and trust (implementation notes)

Backend: **Supabase Auth + PostgreSQL + custom Express API** (service_role server writes).

## Completed in this sprint branch

| Gate | Implementation |
| --- | --- |
| Study Planner | Live planner with goal + target date, mark done, rebuild; syncs via `/api/workspace` per authenticated user |
| Consent enforcement | `user_consents` server record; `insertEvents` / learning writes honor DB flags; `policy_version` stamped |
| Account deletion | Delete + verify + retry + hashed `account_deletion_audit`; UI success after backend confirm |
| Isolation | Session `req.user.id` ownership; client roles revoked (`supabase/rls_ownership_verify.sql`) |
| Age 13+ | Middle school label is `Middle school (13+) / self-learning`; age gate + privacy parent route |

## Operator SQL (run in Supabase if not already)

1. `supabase/student_intelligence.sql`
2. `supabase/user_workspace_rls_harden.sql`
3. `supabase/account_deletion_audit.sql`
4. `supabase/rls_ownership_verify.sql`

## Automated tests

```bash
npm test
```

## Manual beta gates

See backlog matrix: isolation A/B accounts, analytics opt-out DB inspection, delete test account, planner goal/mark-done/cross-device, age gate.
