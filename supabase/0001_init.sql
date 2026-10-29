-- 0001: base tables. Run first on a new Supabase project, then 0002, 0003, 0004, 0005 in order.
-- Note: 0002 replaces the three data-table policies and the touch_session() function defined here.

create table public.favorites (
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

-- Likes and dislikes (one vote per movie, enforced by the primary key)
create table public.votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id int not null,
  kind text not null check (kind in ('like', 'dislike')),
  title text not null,
  genres text[] not null default '{}',
  year text,
  score numeric,
  poster text,
  rating text,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

-- Recent searches
create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index search_history_user_idx on public.search_history (user_id, created_at desc);

-- Keep only the newest 5 searches per user
create or replace function public.trim_search_history()
returns trigger language plpgsql as $$
begin
  delete from public.search_history
  where user_id = new.user_id
    and id not in (
      select id from public.search_history
      where user_id = new.user_id
      order by created_at desc
      limit 5
    );
  return null;
end $$;

create trigger search_history_trim
after insert on public.search_history
for each row execute function public.trim_search_history();

-- Row Level Security: each user sees and changes only their own rows
alter table public.favorites enable row level security;
alter table public.votes enable row level security;
alter table public.search_history enable row level security;

create policy "own favorites" on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own votes" on public.votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own search_history" on public.search_history for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Session activity (the 30-minute rule; 0002 tightens it)
create table public.user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_db_call timestamptz not null default now()
);
alter table public.user_activity enable row level security;
create policy "own activity" on public.user_activity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.touch_session()
returns void language plpgsql security invoker as $$
declare
  last timestamptz;
begin
  select last_db_call into last from public.user_activity where user_id = auth.uid();
  if last is not null and last < now() - interval '30 minutes' then
    raise exception 'session_expired' using errcode = 'P0001';
  end if;
  insert into public.user_activity (user_id, last_db_call)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_db_call = excluded.last_db_call;
end $$;
