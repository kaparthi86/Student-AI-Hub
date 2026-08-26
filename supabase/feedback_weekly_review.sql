-- Weekly feedback review for AI Hub / Student AI
-- Run in Supabase → SQL Editor (every week). Fix top failure modes from negative thumbs.

-- 1) Last 7 days: totals
select
  count(*) as total,
  count(*) filter (where rating = 1) as helpful,
  count(*) filter (where rating = -1) as not_helpful
from public.assistant_feedback
where created_at >= now() - interval '7 days';

-- 2) Top "not helpful" reasons (last 7 days)
select
  coalesce(nullif(trim(reason), ''), 'unknown') as reason,
  count(*) as n
from public.assistant_feedback
where rating = -1
  and created_at >= now() - interval '7 days'
group by 1
order by n desc
limit 15;

-- 3) Breakdown by tool (Ask/learn, Code, Notebook)
select
  coalesce(mode, 'unknown') as mode,
  count(*) filter (where rating = 1) as helpful,
  count(*) filter (where rating = -1) as not_helpful
from public.assistant_feedback
where created_at >= now() - interval '7 days'
group by 1
order by not_helpful desc, helpful desc;

-- 4) Recent negatives to skim (fix preview — no user_id)
select
  id,
  created_at,
  mode,
  study_mode,
  reason,
  left(coalesce(assistant_message, ''), 280) as assistant_preview
from public.assistant_feedback
where rating = -1
  and created_at >= now() - interval '7 days'
order by created_at desc
limit 40;

-- Ritual:
-- 1. Run queries above
-- 2. Note the top 1–2 failure modes (reason + mode)
-- 3. Ship one small fix (prompt contract, UI copy, or bug)
-- 4. Re-check the same queries next week
