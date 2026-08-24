-- 5 שעות שבועיות הן כלולות במחיר הבסיס (600₪), לא דרישת מינימום להגשת בקשה.
-- מטפל/ת יכולים לבקש ססיה של פחות מ-5 שעות (ישולם מחיר הבסיס המלא), ומעבר
-- ל-5 שעות משולם 110₪ לכל שעה נוספת — הנוסחה עצמה לא השתנתה, רק ההגבלה
-- השרירותית שחסמה בקשות של פחות מ-5 שעות.

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
  v_marginal_price numeric;
  v_monthly_price numeric;
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
  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  select (value#>>'{}')::numeric into v_marginal_price from app_settings where key = 'session_marginal_price';
  v_hold_hours := coalesce(v_hold_hours, 72);
  v_base_price := coalesce(v_base_price, 600);
  v_base_hours := coalesce(v_base_hours, 5);
  v_marginal_price := coalesce(v_marginal_price, 110);

  v_monthly_price := v_base_price + greatest(0, v_weekly_hours - v_base_hours) * v_marginal_price;

  insert into session_subscriptions (user_id, status, weekly_hours, monthly_price, hold_expires_at)
  values (v_uid, 'requested', v_weekly_hours, v_monthly_price, now() + (v_hold_hours || ' hours')::interval)
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
          jsonb_build_object('weekly_hours', v_weekly_hours, 'monthly_price', v_monthly_price));

  return query select v_sub_id, v_weekly_hours, v_monthly_price;
end;
$$ language plpgsql security definer set search_path = public;
