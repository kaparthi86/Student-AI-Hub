-- Optional: run in Supabase SQL editor for multi-instance token storage.
-- If skipped, the server falls back to encrypted local file storage in ./data/

create table if not exists public.google_workspace_connections (
  user_id uuid primary key,
  email text,
  token_blob text not null,
  scopes text,
  include_calendar boolean not null default true,
  include_drive boolean not null default true,
  include_gmail boolean not null default true,
  snapshot_text text default '',
  snapshot_meta jsonb default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_workspace_connections enable row level security;

-- No anon/authenticated policies: only the service role (server) should read/write tokens.
revoke all on public.google_workspace_connections from anon, authenticated;
