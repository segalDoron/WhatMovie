-- 0002: session enforcement. Run once in the SQL Editor, after 0001 (Part 1).

-- 1. Users may read their own activity row, but nothing else. Only the functions below write it.
drop policy if exists "own activity" on public.user_activity;
create policy "own activity read" on public.user_activity
  for select using (user_id = auth.uid());

-- 2. Session helpers. security definer lets them write user_activity despite the read-only policy.
create or replace function public.start_session()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.user_activity (user_id, last_db_call) values (auth.uid(), now())
  on conflict (user_id) do update set last_db_call = excluded.last_db_call;
end $$;

create or replace function public.touch_session()
returns void language plpgsql security definer set search_path = public as $$
declare last timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select last_db_call into last from public.user_activity where user_id = auth.uid();
  if last is null or last < now() - interval '30 minutes' then
    raise exception 'session_expired' using errcode = 'P0001';
  end if;
  update public.user_activity set last_db_call = now() where user_id = auth.uid();
end $$;

create or replace function public.session_fresh()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_activity
    where user_id = auth.uid() and last_db_call > now() - interval '30 minutes'
  );
$$;

-- 3. Data tables: reads and writes also require a fresh session, so skipping touch_session is not enough to bypass the rule.
drop policy if exists "own favorites" on public.favorites;
create policy "own favorites" on public.favorites for all
  using (user_id = auth.uid() and public.session_fresh())
  with check (user_id = auth.uid() and public.session_fresh());

drop policy if exists "own votes" on public.votes;
create policy "own votes" on public.votes for all
  using (user_id = auth.uid() and public.session_fresh())
  with check (user_id = auth.uid() and public.session_fresh());

drop policy if exists "own search_history" on public.search_history;
create policy "own search_history" on public.search_history for all
  using (user_id = auth.uid() and public.session_fresh())
  with check (user_id = auth.uid() and public.session_fresh());
