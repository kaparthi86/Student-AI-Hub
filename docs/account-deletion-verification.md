# Account deletion — end-to-end verification

## Automated

```bash
npm run test:account-delete   # mocked delete + verify
npm run test:p0-smoke         # static gates including deletion + privacy
```

## Staging checklist (real test account)

1. Create a dedicated Google test user; sign in.
2. Set Profile fields; open Ask and send a message; upload a small Notebook file; open Voice Tutor once; toggle analytics on.
3. Confirm rows exist in Supabase for that `user_id`:
   - `student_profiles`
   - `user_workspace`
   - `analytics_events` and/or `learning_activity` (if consented)
   - `assistant_feedback` if support/feedback was sent
4. Settings → Delete account & data → type `DELETE` → confirm.
5. Expect success toast, sign-out, login gateway.
6. Re-check Supabase: **zero** rows for that `user_id` in owned tables; Auth user gone.
7. Confirm guest support still works: `/?support=1&guest=1` with contact email → ticket ID.

## What the backend deletes

See `lib/account-delete.js` `OWNED_TABLES`. Critical tables (`student_profiles`, `user_workspace`, `user_consents`) must delete and verify empty before Auth deletion proceeds.

## Documented retention exceptions

Backups, rotated server logs, rate-limit counters, and payment records may remain briefly as described in `privacy.html`.
