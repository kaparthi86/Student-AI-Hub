-- Run this in Supabase → SQL Editor so thumbs-up/down feedback lands in the database.
-- Without this table (or without SUPABASE_SERVICE_ROLE_KEY on the server),
-- feedback falls back to a local feedback.ndjson file and will NOT appear in Table Editor.

create table if not exists public.assistant_feedback (
  id bigint generated always as identity primary key,
  user_id uuid null,
  rating smallint not null check (rating in (-1, 1)),
  reason text null,
  mode text null,
  study_mode text null,
  assistant_message text null,
  client_created_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_feedback_created_at_idx
  on public.assistant_feedback (created_at desc);

create index if not exists assistant_feedback_user_id_idx
  on public.assistant_feedback (user_id);

alter table public.assistant_feedback enable row level security;

-- Server inserts/selects with the service_role key (bypasses RLS).
-- Do not grant anon/authenticated direct access to raw feedback rows.
revoke all on public.assistant_feedback from anon, authenticated;

-- Quick check after setup:
-- select id, rating, reason, mode, study_mode, created_at
-- from public.assistant_feedback
-- order by created_at desc
-- limit 50;
