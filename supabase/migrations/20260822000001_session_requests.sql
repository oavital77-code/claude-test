-- בקליניקה — בקשת ססיה, אישור/דחייה (M5)
-- ר' baclinica-spec.md §3.2-3.3, §6.3-6.4. אין תשלום לפני אישור אדמין — נקודה
-- (CLAUDE.md חוק ברזל #5).

-- ═══ בדיקת התנגשות למשבצת שבועית חוזרת על פני האופק (90 יום) ═══
-- בודקת גם מול הזמנות/חסימות קיימות וגם מול "holds" של בקשות ססיה אחרות
-- שעדיין בתוקף (requested/awaiting_payment עם hold_expires_at עתידי, או
-- מנויים פעילים/בביטול) — כי משבצת ססיה לא הופכת ל-booking אמיתי עד לאישור.
create or replace function session_slot_conflicts(
  p_room_id uuid,
  p_weekday int,
  p_start_time time,
  p_end_time time,
  p_horizon_days int,
  p_exclude_subscription_id uuid default null
) returns boolean as $$
declare
  v_conflict boolean;
begin
  select exists (
    select 1
    from generate_series(0, p_horizon_days - 1) as offset_days
    where extract(dow from (current_date + offset_days)) = p_weekday
      and (
        exists (
          select 1 from bookings b
          where b.room_id = p_room_id
            and b.status = 'confirmed'
            and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(
              ((current_date + offset_days)::text || ' ' || p_start_time::text)::timestamp at time zone 'Asia/Jerusalem',
              ((current_date + offset_days)::text || ' ' || p_end_time::text)::timestamp at time zone 'Asia/Jerusalem',
              '[)'
            )
        )
        or exists (
          select 1 from room_blocks rb
          where rb.room_id = p_room_id
            and tstzrange(rb.starts_at, rb.ends_at, '[)') && tstzrange(
              ((current_date + offset_days)::text || ' ' || p_start_time::text)::timestamp at time zone 'Asia/Jerusalem',
              ((current_date + offset_days)::text || ' ' || p_end_time::text)::timestamp at time zone 'Asia/Jerusalem',
              '[)'
            )
        )
      )
  ) into v_conflict;

  if v_conflict then
    return true;
  end if;

  select exists (
    select 1
    from session_slots ss
    join session_subscriptions s on s.id = ss.subscription_id
    where ss.room_id = p_room_id
      and ss.weekday = p_weekday
      and ss.start_time < p_end_time
      and p_start_time < ss.end_time
      and (p_exclude_subscription_id is null or s.id <> p_exclude_subscription_id)
      and (
        s.status in ('active', 'pending_cancellation')
        or (s.status in ('requested', 'awaiting_payment') and s.hold_expires_at > now())
      )
  ) into v_conflict;

  return v_conflict;
end;
$$ language plpgsql stable;

-- ═══ בקשת ססיה חדשה ═══
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

  if v_weekly_hours < 5 then
    raise exception 'INVALID_SLOT';
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
$$ language plpgsql security definer;

-- ═══ אישור בקשת ססיה — אדמין בלבד ═══
create or replace function approve_session(p_subscription_id uuid)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_slot record;
  v_hold_hours numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
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

  update session_subscriptions
  set status = 'awaiting_payment',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      hold_expires_at = now() + (v_hold_hours || ' hours')::interval
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_approved', 'session_subscriptions', p_subscription_id, '{}'::jsonb);
end;
$$ language plpgsql security definer;

-- ═══ דחיית בקשת ססיה — אדמין בלבד ═══
create or replace function reject_session(p_subscription_id uuid, p_reason text)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status <> 'requested' then
    raise exception 'FORBIDDEN';
  end if;

  update session_subscriptions
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_rejected', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('reason', p_reason));
end;
$$ language plpgsql security definer;
