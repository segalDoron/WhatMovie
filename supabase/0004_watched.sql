-- 0004: movies the user marked as watched. They are never recommended again.
-- Run once in the SQL Editor, after 0002 (it uses session_fresh()).
create table if not exists public.watched (
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id int not null,
  title text not null,
  genres text[] not null default '{}',
  year text,
  score numeric,
  poster text,
  rating text,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

alter table public.watched enable row level security;

drop policy if exists "own watched" on public.watched;
create policy "own watched" on public.watched for all
  using (user_id = auth.uid() and public.session_fresh())
  with check (user_id = auth.uid() and public.session_fresh());
