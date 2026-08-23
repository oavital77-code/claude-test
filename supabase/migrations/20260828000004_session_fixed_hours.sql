-- בקליניקה — ססיה הופכת ממחיר "תמחור שולי לפי שעות" למוצר קבוע: תמיד בדיוק
-- session_base_hours (כברירת מחדל 5) שעות שבועיות, במחיר קבוע session_base_price.
-- אין יותר שעות נוספות בתשלום נפרד — לכן session_marginal_price הופך ללא
-- רלוונטי ומוסר. weekly_hours נשאר עמודה מספרית (לא קבוע קשיח בקוד) כדי
-- שאפשר יהיה לשנות את היקף הססיה הקבוע בעתיד דרך app_settings בלבד,
-- בלי מיגרציה חדשה.
--
-- כתיבה ל-session_subscriptions היא רק דרך ה-RPCs האלה (חוק ברזל #1) — האכיפה
-- כאן מספיקה, אין צורך ב-CHECK constraint נוסף (וגם אי אפשר: CHECK לא יכול
-- להסתמך על שאילתה בטבלה אחרת כמו app_settings).

-- ═══ בקשת ססיה חדשה — סך המשבצות חייב להיות בדיוק session_base_hours ═══
create or replace function request_session(p_slots jsonb)
returns table (subscription_id uuid, weekly_hours numeric, monthly_price numeric) as $$
declare
  v_uid uuid := auth.uid();
  v_status user_status;
  v_slot jsonb;
  v_weekly_hours numeric := 0;
  v_horizon_days constant int := 90;
  v_hold_hours numeric;
  v_base_price numeric;
  v_base_hours numeric;
  v_sub_id uuid;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN';
  end if;

  select status into v_status from profiles where id = v_uid;
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  if p_slots is null or jsonb_array_length(p_slots) = 0 then
    raise exception 'INVALID_SLOT';
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

  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  v_base_hours := coalesce(v_base_hours, 5);

  if v_weekly_hours <> v_base_hours then
    raise exception 'SESSION_HOURS_FIXED';
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if session_slot_conflicts(
      (v_slot->>'room_id')::uuid,
      (v_slot->>'weekday')::int,
      (v_slot->>'start_time')::time,
      (v_slot->>'end_time')::time,
      v_horizon_days,
      null
    ) then
      raise exception 'ROOM_TAKEN';
    end if;
  end loop;

  select (value#>>'{}')::numeric into v_hold_hours from app_settings where key = 'session_hold_hours';
  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  v_hold_hours := coalesce(v_hold_hours, 72);
  v_base_price := coalesce(v_base_price, 600);

  insert into session_subscriptions (user_id, status, weekly_hours, monthly_price, hold_expires_at)
  values (v_uid, 'requested', v_weekly_hours, v_base_price, now() + (v_hold_hours || ' hours')::interval)
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
  values (v_uid, 'session_requested', 'session_subscriptions', v_sub_id,
          jsonb_build_object('weekly_hours', v_weekly_hours, 'monthly_price', v_base_price));

  return query select v_sub_id, v_weekly_hours, v_base_price;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ הוספת משבצת שבועית לססיה פעילה — כעת רק כדי לתקן מנוי שסך שעותיו
--     עדיין לא תואם session_base_hours (למשל ממנוי ישן מלפני המיגרציה הזו).
--     לא ניתן יותר "להוסיף שעות" מעבר להיקף הקבוע. ═══
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
  v_base_price numeric;
  v_base_hours numeric;
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

  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  v_base_price := coalesce(v_base_price, 600);
  v_base_hours := coalesce(v_base_hours, 5);

  v_new_total := (
    select coalesce(sum(extract(epoch from (end_time - start_time)) / 3600), 0)
    from session_slots where subscription_id = p_subscription_id
  ) + extract(epoch from (p_end_time - p_start_time)) / 3600;

  if v_new_total <> v_base_hours then
    raise exception 'SESSION_HOURS_FIXED';
  end if;

  insert into session_slots (subscription_id, room_id, weekday, start_time, end_time)
  values (p_subscription_id, p_room_id, p_weekday, p_start_time, p_end_time);

  update session_subscriptions
  set weekly_hours = v_new_total,
      monthly_price = v_base_price
  where id = p_subscription_id;

  perform materialize_subscription_bookings(p_subscription_id, v_horizon_days);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'admin_added_session_slot', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('room_id', p_room_id, 'weekday', p_weekday, 'start_time', p_start_time, 'end_time', p_end_time));
end;
$$ language plpgsql security definer set search_path = public;

delete from app_settings where key = 'session_marginal_price';
