-- Harden existing user_workspace installs (safe to re-run).
-- Run in Supabase SQL Editor if user_workspace.sql was applied before revoke was added.

alter table if exists public.user_workspace enable row level security;
revoke all on public.user_workspace from anon, authenticated;
