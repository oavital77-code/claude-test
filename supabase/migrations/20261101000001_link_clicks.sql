-- ספירת לחיצות על קישורים יוצאים (Cleana+, באנרים של שותפים). כל לחיצה עוברת
-- דרך /api/go/<link> שרושם שורה כאן ומפנה ליעד. קריאה — אדמין בלבד, ורק
-- כסיכום (admin_link_click_stats); מטפל/ת לא רואה כלום.
create table if not exists link_clicks (
  id bigint generated always as identity primary key,
  link text not null check (link in ('cleana_plus', 'promo_bottom', 'promo_sidebar')),
  user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists link_clicks_link_created_idx on link_clicks (link, created_at desc);

alter table link_clicks enable row level security;
create policy link_clicks_admin_read on link_clicks for select using (is_admin());
-- אין policy לכתיבה: רק דרך record_link_click.

create or replace function record_link_click(p_link text)
returns void as $$
begin
  if auth.uid() is null then
    return; -- הקישורים מוצגים רק למחוברים; לא סופרים בקשות אנונימיות
  end if;
  insert into link_clicks (link, user_id) values (p_link, auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function admin_link_click_stats()
returns table (
  link text,
  total bigint,
  last_7_days bigint,
  last_30_days bigint,
  unique_users bigint,
  last_click_at timestamptz
) as $$
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select c.link,
         count(*),
         count(*) filter (where c.created_at > now() - interval '7 days'),
         count(*) filter (where c.created_at > now() - interval '30 days'),
         count(distinct c.user_id),
         max(c.created_at)
  from link_clicks c
  group by c.link;
end;
$$ language plpgsql stable security definer set search_path = public;

revoke all on function record_link_click(text) from public, anon;
grant execute on function record_link_click(text) to authenticated;
revoke all on function admin_link_click_stats() from public, anon;
grant execute on function admin_link_click_stats() to authenticated;
