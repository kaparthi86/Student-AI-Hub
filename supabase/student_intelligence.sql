-- Student Intelligence & Product Analytics (DATA-001…008)
-- Run in Supabase → SQL Editor after assistant_feedback.sql / user_workspace.sql.
-- Server writes with SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Do NOT put service_role in the browser. Never store names, emails, chat
-- transcripts, or uploaded document contents in analytics_events.properties.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- A. student_profiles — who the student is (separate from behavior events)
-- ---------------------------------------------------------------------------
create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  grade_level text null,
  subjects text null,
  learning_goal text null,
  exam_focus text null,
  explain_style text null,
  reply_language text null,
  country text null,
  region text null,
  board text null,
  account_created_at timestamptz null,
  last_active_at timestamptz null,
  profile_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists student_profiles_last_active_idx
  on public.student_profiles (last_active_at desc nulls last);

alter table public.student_profiles enable row level security;
revoke all on public.student_profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- B. user_sessions — login / session lifecycle
-- ---------------------------------------------------------------------------
create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_session_id text null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  device_category text null,
  platform text null default 'web',
  user_agent_hash text null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists user_sessions_user_started_idx
  on public.user_sessions (user_id, started_at desc);

create index if not exists user_sessions_started_idx
  on public.user_sessions (started_at desc);

alter table public.user_sessions enable row level security;
revoke all on public.user_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- C. analytics_events — product usage / behavior (most important)
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid null references auth.users (id) on delete set null,
  session_id uuid null,
  event_name text not null,
  feature text null,
  properties jsonb not null default '{}'::jsonb,
  platform text null default 'web',
  client_created_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at desc);

create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at desc);

create index if not exists analytics_events_feature_created_idx
  on public.analytics_events (feature, created_at desc);

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- D. learning_activity — quizzes, notebook, coding, study activity
-- ---------------------------------------------------------------------------
create table if not exists public.learning_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_type text not null,
  feature text null,
  subject text null,
  topic text null,
  questions_count int null,
  correct_count int null,
  duration_seconds int null,
  score_pct numeric(5, 2) null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists learning_activity_user_created_idx
  on public.learning_activity (user_id, created_at desc);

create index if not exists learning_activity_type_created_idx
  on public.learning_activity (activity_type, created_at desc);

alter table public.learning_activity enable row level security;
revoke all on public.learning_activity from anon, authenticated;

-- ---------------------------------------------------------------------------
-- E. learning_progress — mastery / gaps snapshot per subject/topic
-- ---------------------------------------------------------------------------
create table if not exists public.learning_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  topic text null,
  mastery_pct numeric(5, 2) null,
  accuracy_pct numeric(5, 2) null,
  knowledge_gap boolean not null default false,
  attempts int not null default 0,
  last_activity_at timestamptz null,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, subject, topic)
);

create index if not exists learning_progress_user_idx
  on public.learning_progress (user_id);

create index if not exists learning_progress_gap_idx
  on public.learning_progress (knowledge_gap)
  where knowledge_gap = true;

alter table public.learning_progress enable row level security;
revoke all on public.learning_progress from anon, authenticated;

-- ---------------------------------------------------------------------------
-- F. user_consents — analytics / privacy choices
-- ---------------------------------------------------------------------------
create table if not exists public.user_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  analytics_enabled boolean not null default true,
  learning_analytics_enabled boolean not null default true,
  personalization_enabled boolean not null default true,
  consent_version text not null default 'v1',
  consented_at timestamptz null,
  updated_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

alter table public.user_consents enable row level security;
revoke all on public.user_consents from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpful aggregate views for admin dashboard (service_role only)
-- ---------------------------------------------------------------------------
create or replace view public.analytics_daily_active as
select
  date_trunc('day', created_at)::date as day,
  count(distinct user_id) as dau
from public.analytics_events
where user_id is not null
group by 1;

create or replace view public.analytics_feature_adoption as
select
  coalesce(nullif(feature, ''), event_name) as feature_key,
  count(*) as event_count,
  count(distinct user_id) as unique_users
from public.analytics_events
where created_at > now() - interval '30 days'
group by 1
order by unique_users desc;

comment on table public.student_profiles is 'Student Intelligence: profile (no behavior events).';
comment on table public.analytics_events is 'Product analytics events — no PII/transcripts in properties.';
comment on table public.learning_activity is 'Learning outcomes activity log.';
comment on table public.learning_progress is 'Per-subject/topic mastery and gaps.';
comment on table public.user_consents is 'Analytics and personalization consent.';
