-- הגבלת קצב לבדיקת הזמנות מול חנות ה-Woo (16/10).
--
-- עד עכשיו כל טעינת עמוד של כל מטפל/ת הפעילה קריאת REST לחנות (layout →
-- pollWooOrders). עם מאות מטפלות זה מאות קריאות בשעה, והחנות (או ה-WAF
-- שלה) עלולה לחסום את Cleana — היה 503 בודד ב-15/10. כאן "תור" גלובלי אחד:
-- לכל היותר בדיקה אחת בכל חלון, משותף לכל המופעים של השרת (serverless).
-- ה-cron היומי לא מוגבל (רשת ביטחון).

create table if not exists woo_poll_state (
  id int primary key default 1 check (id = 1),
  last_polled_at timestamptz not null default 'epoch'
);

alter table woo_poll_state enable row level security;
-- בלי policies: רק service-role (שעוקף RLS) ניגש, דרך try_claim_woo_poll.

insert into woo_poll_state (id) values (1) on conflict (id) do nothing;

-- מחזיר true אם הקורא "זכה" בבדיקה (עבר מספיק זמן מהקודמת) — אטומי: שני
-- מופעים במקביל לא יזכו שניהם, כי ה-UPDATE נועל את השורה.
create or replace function try_claim_woo_poll(p_min_interval_seconds int)
returns boolean as $$
declare
  v_claimed boolean;
begin
  update woo_poll_state
  set last_polled_at = now()
  where id = 1 and last_polled_at <= now() - make_interval(secs => p_min_interval_seconds)
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function try_claim_woo_poll(int) from public, anon, authenticated;
grant execute on function try_claim_woo_poll(int) to service_role;
