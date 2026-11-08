-- 0006: keep the newest 10 searches per user (was 5). Run once in the SQL Editor.
create or replace function public.trim_search_history()
returns trigger language plpgsql as $$
begin
  delete from public.search_history
  where user_id = new.user_id
    and id not in (
      select id from public.search_history
      where user_id = new.user_id
      order by created_at desc
      limit 10
    );
  return null;
end $$;
