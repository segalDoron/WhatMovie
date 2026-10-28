-- 0005: recommendation metrics, privacy-friendly version. Run once in the SQL Editor.
-- If you ran an earlier version of this file, this REPLACES it (its metric tables are dropped; they only held test data).
--
-- Privacy design:
--  * the metric tables never hold the user id: they hold a keyed hash (user_hash) that only the server and this database can compute;
--  * they store the genres that were requested, not the search form;
--  * the views you read are aggregated and hide any group with fewer than `min_users` distinct people;
--  * data older than 90 days is deleted, a user can switch collection off (which also deletes what was collected),
--    and deleting a user account deletes their metrics.
--
-- BEFORE RUNNING: pick a long random string (for example from your password manager) and use it in the two places marked SALT:
--   1. in the INSERT below (the database), and 2. as the METRICS_SALT environment variable in Vercel (the server). They must be identical.

create extension if not exists pgcrypto with schema extensions;

drop view if exists public.rec_rates_by_position, public.rec_rates_by_tmdb_order, public.rec_performance, public.rec_diversity, public.rec_outcomes cascade;
drop table if exists public.rec_impressions, public.rec_requests cascade;

-- ---------- Secret + settings of the metrics (nobody can read it through the API) ----------
create table if not exists public.metrics_secret (
  salt text not null,
  min_users int not null default 5          -- groups with fewer people than this are hidden from the views (use 1 while testing alone)
);
alter table public.metrics_secret enable row level security;
revoke all on public.metrics_secret from anon, authenticated;
delete from public.metrics_secret;
insert into public.metrics_secret (salt, min_users) values ('SALT-PASTE-YOUR-RANDOM-STRING-HERE', 1);  -- SALT (1). Raise min_users to 5 or more when you have real users.

create or replace function public.rec_hash(uid uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(extensions.hmac(uid::text, (select salt from public.metrics_secret limit 1), 'sha256'), 'hex')
$$;
revoke all on function public.rec_hash(uuid) from public, anon, authenticated;

-- ---------- The user's choice: share anonymous usage data or not ----------
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  share_usage boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists "own preferences" on public.user_preferences;
create policy "own preferences" on public.user_preferences for all
  using (user_id = auth.uid() and public.session_fresh()) with check (user_id = auth.uid() and public.session_fresh());

-- ---------- The metric tables ----------
create table public.rec_requests (
  id uuid primary key,
  session_id uuid not null,                 -- one search and all its "Show more" pages
  user_hash text not null,                  -- keyed hash of the user id: not the id itself
  page_no int not null,                     -- 1 = the first 20
  created_at timestamptz not null default now(),
  ms int,                                   -- server time to build the page (page 1 = time to the first 20)
  tmdb_calls int,
  gemini_calls int,
  gemini_rated int,                         -- movies on this page that Gemini scored
  gemini_removed int,                       -- movies Gemini removed as clear misfits
  candidates int,                           -- movies ranked for this page
  buffer_after int,                         -- ranked movies kept for the next pages
  genre_mix jsonb,                          -- movies per genre level: {"strong":..,"compatible":..,...}
  diversity jsonb,                          -- {"genres":n,"maxGenreShare":x,"decades":n}
  requested_genres int[]                    -- TMDB genre ids the search asked for (not the search form)
);
create index rec_requests_session on public.rec_requests (session_id);
create index rec_requests_created on public.rec_requests (created_at);
create index rec_requests_user on public.rec_requests (user_hash);

create table public.rec_impressions (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  session_id uuid not null,
  user_hash text not null,
  movie_id int not null,
  position int not null,                    -- place in the whole list of the search (1, 2, 3 ...)
  tmdb_order int,                           -- the order TMDB returned it in (lower = TMDB's default would show it earlier)
  base numeric,                             -- personalized score 0-100 (with Gemini's blend)
  rank_key numeric,                         -- final sort key
  tier int,                                 -- genre level: 0 strong ... 4 weak
  gemini_score int,                         -- null when Gemini did not rate it
  created_at timestamptz not null default now()
);
create index rec_impressions_user_movie on public.rec_impressions (user_hash, movie_id);
create index rec_impressions_created on public.rec_impressions (created_at);

alter table public.rec_requests enable row level security;
alter table public.rec_impressions enable row level security;
revoke all on public.rec_requests, public.rec_impressions from anon, authenticated;

-- ---------- Deleting data ----------
-- A user turns collection off (the app calls this): their metrics are deleted.
create or replace function public.rec_forget_me() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare h text := public.rec_hash(auth.uid());
begin
  if auth.uid() is null then return; end if;
  delete from public.rec_impressions where user_hash = h;
  delete from public.rec_requests where user_hash = h;
end $$;
revoke all on function public.rec_forget_me() from public, anon;
grant execute on function public.rec_forget_me() to authenticated;

-- Deleting an account deletes its metrics.
create or replace function public.rec_forget_deleted_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare h text := public.rec_hash(old.id);
begin
  delete from public.rec_impressions where user_hash = h;
  delete from public.rec_requests where user_hash = h;
  return old;
end $$;
drop trigger if exists rec_forget_on_user_delete on auth.users;
create trigger rec_forget_on_user_delete after delete on auth.users for each row execute function public.rec_forget_deleted_user();

-- Retention: delete data older than N days. The server also runs this about once a day; you can schedule it here too (optional):
--   create extension if not exists pg_cron;
--   select cron.schedule('rec-purge', '17 3 * * *', $$select public.rec_purge(90)$$);
create or replace function public.rec_purge(days int default 90) returns void
language sql security definer set search_path = public as $$
  delete from public.rec_impressions where created_at < now() - make_interval(days => days);
  delete from public.rec_requests where created_at < now() - make_interval(days => days);
$$;
revoke all on function public.rec_purge(int) from public, anon, authenticated;

-- ---------- Views you read (aggregated, small groups hidden) ----------
create or replace view public.rec_outcomes as
with v as (select public.rec_hash(user_id) as h, movie_id, kind, created_at from public.votes),
     f as (select public.rec_hash(user_id) as h, movie_id, created_at from public.favorites),
     w as (select public.rec_hash(user_id) as h, movie_id, created_at from public.watched)
select
  i.*,
  exists (select 1 from v where v.h = i.user_hash and v.movie_id = i.movie_id and v.kind = 'like' and v.created_at >= i.created_at) as liked,
  exists (select 1 from v where v.h = i.user_hash and v.movie_id = i.movie_id and v.kind = 'dislike' and v.created_at >= i.created_at) as disliked,
  exists (select 1 from f where f.h = i.user_hash and f.movie_id = i.movie_id and f.created_at >= i.created_at) as favorited,
  exists (select 1 from w where w.h = i.user_hash and w.movie_id = i.movie_id and w.created_at >= i.created_at) as watched
from public.rec_impressions i;

-- Like / dislike / favorite rate by where the movie was shown.
create or replace view public.rec_rates_by_position as
select
  case when position <= 5 then '01-05' when position <= 10 then '06-10' when position <= 20 then '11-20' when position <= 40 then '21-40' else '41+' end as shown_position,
  count(*) as shown,
  count(distinct user_hash) as people,
  round(100.0 * avg(liked::int), 1) as like_rate_pct,
  round(100.0 * avg(disliked::int), 1) as dislike_rate_pct,
  round(100.0 * avg(favorited::int), 1) as favorite_rate_pct,
  round(100.0 * avg(watched::int), 1) as watched_rate_pct
from public.rec_outcomes
group by 1
having count(distinct user_hash) >= (select min_users from public.metrics_secret limit 1)
order by 1;

-- The same by the order TMDB returned the movies in: compare with the view above to see whether
-- personalized ranking puts liked movies higher than TMDB's own order would.
create or replace view public.rec_rates_by_tmdb_order as
select
  case when tmdb_order % 100 < 5 then '01-05' when tmdb_order % 100 < 10 then '06-10' when tmdb_order % 100 < 20 then '11-20' else '21+' end as tmdb_position_in_batch,
  count(*) as shown,
  count(distinct user_hash) as people,
  round(100.0 * avg(liked::int), 1) as like_rate_pct,
  round(100.0 * avg(disliked::int), 1) as dislike_rate_pct,
  round(100.0 * avg(favorited::int), 1) as favorite_rate_pct
from public.rec_outcomes
where tmdb_order is not null
group by 1
having count(distinct user_hash) >= (select min_users from public.metrics_secret limit 1)
order by 1;

-- Speed and cost per day. Page 1 is the time to the first 20.
create or replace view public.rec_performance as
select
  date_trunc('day', created_at)::date as day,
  count(distinct user_hash) as people,
  count(*) filter (where page_no = 1) as searches,
  count(*) as pages,
  round(avg(ms) filter (where page_no = 1)) as avg_ms_first_20,
  round((percentile_cont(0.95) within group (order by ms) filter (where page_no = 1))::numeric) as p95_ms_first_20,
  round(avg(tmdb_calls), 1) as avg_tmdb_calls,
  round(avg(gemini_calls), 2) as avg_gemini_calls,
  round(100.0 * avg((gemini_calls > 0)::int), 1) as pages_with_gemini_pct,
  round(avg(gemini_removed), 2) as avg_gemini_removed
from public.rec_requests
group by 1
having count(distinct user_hash) >= (select min_users from public.metrics_secret limit 1)
order by 1 desc;

-- Variety of the pages.
create or replace view public.rec_diversity as
select
  date_trunc('day', created_at)::date as day,
  count(distinct user_hash) as people,
  round(avg((diversity->>'genres')::numeric), 1) as avg_distinct_genres,
  round(avg((diversity->>'maxGenreShare')::numeric), 2) as avg_max_genre_share,
  round(avg((diversity->>'decades')::numeric), 1) as avg_decades,
  round(avg((genre_mix->>'strong')::numeric), 1) as avg_strong_matches,
  round(avg((genre_mix->>'conflicting')::numeric), 1) as avg_conflicting_matches
from public.rec_requests
group by 1
having count(distinct user_hash) >= (select min_users from public.metrics_secret limit 1)
order by 1 desc;

revoke all on public.rec_outcomes, public.rec_rates_by_position, public.rec_rates_by_tmdb_order, public.rec_performance, public.rec_diversity from anon, authenticated;
