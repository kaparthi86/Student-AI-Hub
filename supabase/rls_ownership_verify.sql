-- Defense-in-depth RLS for student-owned tables.
-- The app writes via service_role (bypasses RLS). Client roles stay revoked.
-- Optional owner policies document the intended auth.uid() isolation model.
-- Safe to re-run in Supabase SQL Editor.

-- user_workspace
alter table if exists public.user_workspace enable row level security;
revoke all on public.user_workspace from anon, authenticated;

-- student intelligence tables
alter table if exists public.student_profiles enable row level security;
alter table if exists public.user_sessions enable row level security;
alter table if exists public.analytics_events enable row level security;
alter table if exists public.learning_activity enable row level security;
alter table if exists public.learning_progress enable row level security;
alter table if exists public.user_consents enable row level security;

revoke all on public.student_profiles from anon, authenticated;
revoke all on public.user_sessions from anon, authenticated;
revoke all on public.analytics_events from anon, authenticated;
revoke all on public.learning_activity from anon, authenticated;
revoke all on public.learning_progress from anon, authenticated;
revoke all on public.user_consents from anon, authenticated;

-- feedback / support
alter table if exists public.assistant_feedback enable row level security;
revoke all on public.assistant_feedback from anon, authenticated;

-- deletion audit
alter table if exists public.account_deletion_audit enable row level security;
revoke all on public.account_deletion_audit from anon, authenticated;
