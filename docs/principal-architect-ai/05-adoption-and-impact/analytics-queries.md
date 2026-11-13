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

## Student intelligence schema (shipped)

Run `supabase/student_intelligence.sql`.

APIs (signed-in):

- `POST /api/analytics/events` — batched product events  
- `PUT /api/analytics/profile` — sync learner profile  
- `PUT /api/analytics/consent` — analytics / learning / personalization  
- `POST /api/analytics/session/start|end`  
- `POST /api/analytics/learning` — activity + progress upserts  
- `GET /api/analytics/dashboard?days=7` — admin allowlist only  

```sql
-- Feature adoption (30d)
select coalesce(feature, event_name) as feature_key,
       count(*) as events,
       count(distinct user_id) as users
from public.analytics_events
where created_at > now() - interval '30 days'
group by 1
order by users desc;

-- Weekly active students
select count(distinct user_id) as wau
from public.analytics_events
where created_at > now() - interval '7 days'
  and user_id is not null;
```
