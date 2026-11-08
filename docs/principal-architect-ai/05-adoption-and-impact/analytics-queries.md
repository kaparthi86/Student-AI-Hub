# Analytics Queries

## Supabase — feedback (shipped SQL companions)

Use repo files:

- `supabase/assistant_feedback.sql` — schema  
- `supabase/feedback_weekly_review.sql` — weekly negatives  

API equivalents while signed in:

- `GET /api/feedback-summary?days=7`  
- `GET /api/feedback-review?days=7` (founder emails via `FEEDBACK_REVIEW_EMAILS`)

## Supabase — user counts (run in SQL editor)

```sql
-- Registered users (Auth schema; permissions vary by project)
select count(*) as users
from auth.users;

select date_trunc('week', created_at) as week, count(*) as signups
from auth.users
group by 1
order by 1 desc
limit 12;
```

## Suggested event table (not yet required in app)

```sql
create table if not exists public.product_events (
  id bigserial primary key,
  user_id uuid,
  event_name text not null,
  mode text,
  created_at timestamptz default now(),
  meta jsonb default '{}'::jsonb
);

-- Example: study_turn_completed, voice_barge_in, notebook_analyze
```

Instrument later from `sendChatMessage` success path and Voice Tutor completion.
