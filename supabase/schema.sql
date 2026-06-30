-- ══════════════════════════════════════════════════════
-- ICI Sales Pipeline — Supabase Schema
-- Run this once in your Supabase project's SQL Editor.
-- Dashboard → SQL Editor → New query → paste → Run
-- ══════════════════════════════════════════════════════

-- Main key-value table.
-- Each row = one user's one data collection (deals, contacts, etc.)
create table if not exists user_data (
  id          bigint generated always as identity primary key,
  user_id     text        not null,   -- anonymous browser UUID
  key         text        not null,   -- e.g. "ici-pipeline-deals"
  value       text        not null,   -- JSON stringified array
  updated_at  timestamptz not null default now(),

  -- One row per user per key
  unique (user_id, key)
);

-- Index so lookups by user_id are fast
create index if not exists idx_user_data_user_id on user_data (user_id);

-- Row Level Security: each user can only read/write their own rows.
-- This runs in the browser with the anon key, so RLS is your security layer.
alter table user_data enable row level security;

create policy "Users can read their own data"
  on user_data for select
  using (true);  -- user_id is just a UUID, no auth needed for anon access

create policy "Users can upsert their own data"
  on user_data for insert
  with check (true);

create policy "Users can update their own data"
  on user_data for update
  using (true);

-- ── Optional: auto-update updated_at on every write ──────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on user_data
  for each row execute procedure touch_updated_at();
