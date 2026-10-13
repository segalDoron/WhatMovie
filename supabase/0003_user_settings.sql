-- 0003: per-user Gemini key (BYOK). Run once in the SQL Editor.
-- The key column is encrypted by the server. The browser can only read the non-secret columns.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gemini_key_enc text not null,
  key_last4 text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

revoke all on public.user_settings from anon, authenticated;
grant select (user_id, key_last4, updated_at) on public.user_settings to authenticated;

drop policy if exists "own settings read" on public.user_settings;
create policy "own settings read" on public.user_settings
  for select using (user_id = auth.uid());
-- No insert / update / delete policies: only the server (service role) writes.
