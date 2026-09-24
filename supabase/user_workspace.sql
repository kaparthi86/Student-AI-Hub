-- One saved workspace per signed-in user (study threads + finance plan).
-- The server writes this with SUPABASE_SERVICE_ROLE_KEY. Run once in the SQL editor.

create table if not exists public.user_workspace (
  user_id uuid primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_workspace enable row level security;
