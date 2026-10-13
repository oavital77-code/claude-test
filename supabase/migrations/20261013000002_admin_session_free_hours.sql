-- בקליניקה — ססיות אדמין בהיקף חופשי + מחיר חודשי ידני (13/10).
--
-- בקשת הבעלים: לפרוס ססיות "חופשי, בלי מגבלה של שעות — רק לאדמין". מטפל/ת
-- שמבקש/ת ססיה בעצמו/ה (request_session) נשאר/ת על 5 שעות בדיוק; כל מסלולי
-- האדמין (יצירה, קליטה מ-Skedda, הוספת משבצת) מקבלים כל היקף. המחיר החודשי:
-- p_monthly_price שהאדמין מזין, ואם ריק — יחסי לשעות (בסיס ÷ 5 × שעות).
-- admin_set_session_price חדש לעדכון מחיר של ססיה קיימת.
--
-- ⚠️ גם השלמה של 20260901000002/3, שמעולם לא הוחלו בפרודקשן (התגלה 13/10:
-- admin_create_session_prepaid חסר — קליטת ססיה מ-Skedda נכשלה; approve_session
-- בלי p_term_months — אישור בקשת ססיה נכשל).
--
-- בלי DROP בכוונה: חתימות חדשות לצד הישנות (PostgREST בוחר לפי שמות הפרמטרים
-- שהאפליקציה שולחת — תמיד את החדשות). בפרודקשן נשארות approve_session(uuid)
-- ו-admin_create_session(uuid, jsonb, date) הישנות, לא בשימוש — לניקוי בהמשך.

create or replace function approve_session(p_subscription_id uuid, p_term_months integer default null)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_slot record;
  v_hold_hours numeric;
  v_effective_end date;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_term_months is not null and p_term_months not in (1, 3, 6, 12) then
    raise exception 'INVALID_TERM';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status <> 'requested' then
    raise exception 'FORBIDDEN';
  end if;

  for v_slot in select * from session_slots where subscription_id = p_subscription_id loop
    if session_slot_conflicts(
      v_slot.room_id, v_slot.weekday, v_slot.start_time, v_slot.end_time, 90, p_subscription_id
    ) then
      raise exception 'ROOM_TAKEN';
    end if;
  end loop;

  select (value#>>'{}')::numeric into v_hold_hours from app_settings where key = 'session_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 72);

  if p_term_months is not null then
    v_effective_end := coalesce(v_sub.start_date, current_date) + (p_term_months || ' months')::interval;
  end if;

  update session_subscriptions
  set status = 'awaiting_payment',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      hold_expires_at = now() + (v_hold_hours || ' hours')::interval,
      effective_end_date = coalesce(v_effective_end, effective_end_date)
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_approved', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('term_months', p_term_months, 'effective_end_date', v_effective_end));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function admin_create_session(
  p_user_id uuid,
  p_slots jsonb,
  p_start_date date default null,
  p_term_months integer default null,
  p_monthly_price numeric default null
)
returns table (subscription_id uuid, weekly_hours numeric, monthly_price numeric) as $$
declare
  v_status user_status;
  v_slot jsonb;
  v_weekly_hours numeric := 0;
  v_hold_hours numeric;
  v_base_price numeric;
  v_base_hours numeric;
  v_start_date date;
  v_effective_end date;
  v_sub_id uuid;
  v_price numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_term_months is not null and p_term_months not in (1, 3, 6, 12) then
    raise exception 'INVALID_TERM';
  end if;

  select status into v_status from profiles where id = p_user_id;
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  if p_slots is null or jsonb_array_length(p_slots) = 0 then
    raise exception 'INVALID_SLOT';
  end if;

  if p_start_date is not null and p_start_date < current_date then
    raise exception 'INVALID_START_DATE';
  end if;
  v_start_date := coalesce(p_start_date, current_date);

  if p_term_months is not null then
    v_effective_end := v_start_date + (p_term_months || ' months')::interval;
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if (v_slot->>'weekday')::int not between 0 and 6 then
      raise exception 'INVALID_SLOT';
    end if;
    if (v_slot->>'end_time')::time <= (v_slot->>'start_time')::time then
      raise exception 'INVALID_SLOT';
    end if;
    if extract(epoch from (v_slot->>'start_time')::time)::int % 1800 <> 0
       or extract(epoch from (v_slot->>'end_time')::time)::int % 1800 <> 0 then
      raise exception 'INVALID_SLOT';
    end if;
    if not exists (select 1 from rooms where id = (v_slot->>'room_id')::uuid and active) then
      raise exception 'ROOM_UNAVAILABLE';
    end if;

    v_weekly_hours := v_weekly_hours
      + extract(epoch from ((v_slot->>'end_time')::time - (v_slot->>'start_time')::time)) / 3600;
  end loop;

  -- אדמין: היקף חופשי (לא בהכרח 5 ש׳). המחיר — מה שהאדמין הזין, או יחסי
  -- לשעות כברירת מחדל (מחיר בסיס ÷ שעות בסיס × שעות בפועל).
  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  v_base_hours := coalesce(v_base_hours, 5);
  if v_weekly_hours <= 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if p_monthly_price is not null and (p_monthly_price < 0 or p_monthly_price > 100000) then
    raise exception 'INVALID_PRICE';
  end if;

  select (value#>>'{}')::numeric into v_hold_hours from app_settings where key = 'session_hold_hours';
  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  v_hold_hours := coalesce(v_hold_hours, 72);
  v_base_price := coalesce(v_base_price, 600);
  v_price := coalesce(p_monthly_price, round(v_base_price / v_base_hours * v_weekly_hours));

  insert into session_subscriptions (
    user_id, status, weekly_hours, monthly_price, start_date, hold_expires_at, reviewed_by, reviewed_at,
    effective_end_date
  )
  values (
    p_user_id, 'awaiting_payment', v_weekly_hours, v_price, v_start_date,
    now() + (v_hold_hours || ' hours')::interval, auth.uid(), now(),
    v_effective_end
  )
  returning id into v_sub_id;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    insert into session_slots (subscription_id, room_id, weekday, start_time, end_time)
    values (
      v_sub_id,
      (v_slot->>'room_id')::uuid,
      (v_slot->>'weekday')::int,
      (v_slot->>'start_time')::time,
      (v_slot->>'end_time')::time
    );
  end loop;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_created_by_admin', 'session_subscriptions', v_sub_id,
          jsonb_build_object(
            'user_id', p_user_id, 'weekly_hours', v_weekly_hours, 'start_date', v_start_date,
            'term_months', p_term_months, 'effective_end_date', v_effective_end,
            'monthly_price', v_price
          ));

  return query select v_sub_id, v_weekly_hours, v_price;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function admin_create_session_prepaid(
  p_user_id uuid,
  p_slots jsonb,
  p_start_date date default null,
  p_term_months integer default null,
  p_monthly_price numeric default null
)
returns table (subscription_id uuid) as $$
declare
  v_status user_status;
  v_slot jsonb;
  v_weekly_hours numeric := 0;
  v_base_price numeric;
  v_base_hours numeric;
  v_start_date date;
  v_effective_end date;
  v_sub_id uuid;
  v_price numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_term_months is not null and p_term_months not in (1, 3, 6, 12) then
    raise exception 'INVALID_TERM';
  end if;

  select status into v_status from profiles where id = p_user_id;
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  if p_slots is null or jsonb_array_length(p_slots) = 0 then
    raise exception 'INVALID_SLOT';
  end if;

  if p_start_date is not null and p_start_date < current_date then
    raise exception 'INVALID_START_DATE';
  end if;
  v_start_date := coalesce(p_start_date, current_date);

  if p_term_months is not null then
    v_effective_end := v_start_date + (p_term_months || ' months')::interval;
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if (v_slot->>'weekday')::int not between 0 and 6 then
      raise exception 'INVALID_SLOT';
    end if;
    if (v_slot->>'end_time')::time <= (v_slot->>'start_time')::time then
      raise exception 'INVALID_SLOT';
    end if;
    if extract(epoch from (v_slot->>'start_time')::time)::int % 1800 <> 0
       or extract(epoch from (v_slot->>'end_time')::time)::int % 1800 <> 0 then
      raise exception 'INVALID_SLOT';
    end if;
    if not exists (select 1 from rooms where id = (v_slot->>'room_id')::uuid and active) then
      raise exception 'ROOM_UNAVAILABLE';
    end if;

    v_weekly_hours := v_weekly_hours
      + extract(epoch from ((v_slot->>'end_time')::time - (v_slot->>'start_time')::time)) / 3600;
  end loop;

  -- אדמין: היקף חופשי (לא בהכרח 5 ש׳). המחיר — מה שהאדמין הזין, או יחסי
  -- לשעות כברירת מחדל (מחיר בסיס ÷ שעות בסיס × שעות בפועל).
  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  v_base_hours := coalesce(v_base_hours, 5);
  if v_weekly_hours <= 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if p_monthly_price is not null and (p_monthly_price < 0 or p_monthly_price > 100000) then
    raise exception 'INVALID_PRICE';
  end if;

  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  v_base_price := coalesce(v_base_price, 600);
  v_price := coalesce(p_monthly_price, round(v_base_price / v_base_hours * v_weekly_hours));

  insert into session_subscriptions (
    user_id, status, weekly_hours, monthly_price, start_date, next_billing_date,
    reviewed_by, reviewed_at, effective_end_date
  )
  values (
    p_user_id, 'active', v_weekly_hours, v_price, v_start_date,
    v_start_date + interval '1 month', auth.uid(), now(), v_effective_end
  )
  returning id into v_sub_id;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    insert into session_slots (subscription_id, room_id, weekday, start_time, end_time)
    values (
      v_sub_id,
      (v_slot->>'room_id')::uuid,
      (v_slot->>'weekday')::int,
      (v_slot->>'start_time')::time,
      (v_slot->>'end_time')::time
    );
  end loop;

  perform materialize_subscription_bookings(v_sub_id, 90);
  perform cleanup_skedda_import_blocks(v_sub_id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_created_prepaid_migration', 'session_subscriptions', v_sub_id,
          jsonb_build_object(
            'user_id', p_user_id, 'weekly_hours', v_weekly_hours, 'start_date', v_start_date,
            'term_months', p_term_months, 'effective_end_date', v_effective_end, 'monthly_price', v_price,
            'note', 'הועבר מ-Skedda — שולם כבר במערכת הישנה, בלי חיוב ראשוני'
          ));

  return query select v_sub_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function admin_add_session_slot(
  p_subscription_id uuid,
  p_room_id uuid,
  p_weekday int,
  p_start_time time,
  p_end_time time
) returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_horizon_days constant int := 90;
  v_new_total numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if v_sub.status not in ('active', 'pending_cancellation') then
    raise exception 'INVALID_SLOT';
  end if;

  if p_weekday not between 0 and 6 then
    raise exception 'INVALID_SLOT';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'INVALID_SLOT';
  end if;
  if extract(epoch from p_start_time)::int % 1800 <> 0
     or extract(epoch from p_end_time)::int % 1800 <> 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if not exists (select 1 from rooms where id = p_room_id and active) then
    raise exception 'ROOM_UNAVAILABLE';
  end if;
  if session_slot_conflicts(p_room_id, p_weekday, p_start_time, p_end_time, v_horizon_days, p_subscription_id) then
    raise exception 'ROOM_TAKEN';
  end if;

  -- היקף חופשי לאדמין: בלי בדיקת "בדיוק 5 שעות". המחיר החודשי לא משתנה
  -- כאן — האדמין מעדכן אותו בנפרד (admin_set_session_price) אם צריך.
  v_new_total := (
    select coalesce(sum(extract(epoch from (end_time - start_time)) / 3600), 0)
    from session_slots where subscription_id = p_subscription_id
  ) + extract(epoch from (p_end_time - p_start_time)) / 3600;

  insert into session_slots (subscription_id, room_id, weekday, start_time, end_time)
  values (p_subscription_id, p_room_id, p_weekday, p_start_time, p_end_time);

  update session_subscriptions
  set weekly_hours = v_new_total
  where id = p_subscription_id;

  perform materialize_subscription_bookings(p_subscription_id, v_horizon_days);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'admin_added_session_slot', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('room_id', p_room_id, 'weekday', p_weekday, 'start_time', p_start_time, 'end_time', p_end_time));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function admin_set_session_price(p_subscription_id uuid, p_monthly_price numeric)
returns void as $$
declare
  v_old numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_monthly_price is null or p_monthly_price < 0 or p_monthly_price > 100000 then
    raise exception 'INVALID_PRICE';
  end if;

  select monthly_price into v_old from session_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  update session_subscriptions set monthly_price = p_monthly_price where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'session_price_changed', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('monthly_price', v_old), jsonb_build_object('monthly_price', p_monthly_price));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function admin_renew_session_term(p_subscription_id uuid, p_term_months integer)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_new_end date;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_term_months not in (1, 3, 6, 12) then
    raise exception 'INVALID_TERM';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'expired') then
    raise exception 'FORBIDDEN';
  end if;

  v_new_end := current_date + (p_term_months || ' months')::interval;

  update session_subscriptions
  set effective_end_date = v_new_end
  where id = p_subscription_id;

  perform materialize_subscription_bookings(p_subscription_id, 90);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_term_renewed', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('term_months', p_term_months, 'effective_end_date', v_new_end));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function admin_end_session_term(p_subscription_id uuid)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'expired') then
    raise exception 'FORBIDDEN';
  end if;

  update session_subscriptions
  set status = 'cancelled',
      effective_end_date = least(coalesce(effective_end_date, current_date), current_date)
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_term_ended_by_admin', 'session_subscriptions', p_subscription_id, '{}'::jsonb);
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function admin_set_session_price(uuid, numeric) from public, anon;
grant execute on function admin_set_session_price(uuid, numeric) to authenticated;
