-- Minimal account-deletion audit (no emails, names, or message content).
-- Safe to re-run. Server writes with service_role only.

create table if not exists public.account_deletion_audit (
  id bigint generated always as identity primary key,
  user_id_hash text not null,
  ok boolean not null default false,
  auth_deleted boolean not null default false,
  tables_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_deletion_audit_created_at_idx
  on public.account_deletion_audit (created_at desc);

alter table public.account_deletion_audit enable row level security;
revoke all on public.account_deletion_audit from anon, authenticated;

comment on table public.account_deletion_audit is
  'Minimal deletion audit: hashed user id + success flags only.';
