-- ממצאים קלים מהבדיקה המעמיקה (31/10, קבוצה 4). רק create or replace — בלי
-- מחיקות.

-- 1. admin_edit_booking: עריכת שיבוץ אחרי שנשלחה תזכורת 24 שעות לא איפסה את
--    reminder_sent_at — לא נשלחה תזכורת למועד החדש (reschedule_booking כן מאפס).
create or replace function admin_edit_booking(
  p_booking_id uuid, p_room_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid as $$
declare
  v_b bookings%rowtype;
  v_new_hours numeric;
  v_delta numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_b from bookings where id = p_booking_id for update;
  if not found or v_b.status <> 'confirmed' then
    raise exception 'BOOKING_PASSED';
  end if;

  if v_b.source = 'session' then
    return admin_session_move_occurrence(p_booking_id, p_room_id, p_starts_at, p_ends_at);
  end if;

  if p_ends_at <= p_starts_at
     or extract(epoch from p_starts_at)::bigint % 1800 <> 0
     or extract(epoch from p_ends_at)::bigint % 1800 <> 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if not exists (select 1 from rooms where id = p_room_id and active) then
    raise exception 'ROOM_UNAVAILABLE';
  end if;
  if exists (
    select 1 from room_blocks
    where room_id = p_room_id and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'ROOM_BLOCKED';
  end if;
  if exists (
    select 1 from bookings
    where user_id = v_b.user_id and status = 'confirmed' and id <> p_booking_id
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'SELF_OVERLAP';
  end if;

  v_new_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600;
  v_delta := v_new_hours - coalesce(v_b.hours_charged, 0);

  if v_b.source = 'punch_card' and v_b.punch_card_id is not null and v_delta <> 0 then
    update punch_cards set hours_remaining = hours_remaining - v_delta where id = v_b.punch_card_id;
  end if;

  begin
    update bookings
    set room_id = p_room_id, starts_at = p_starts_at, ends_at = p_ends_at, hours_charged = v_new_hours,
        reminder_sent_at = case when starts_at = p_starts_at then reminder_sent_at end
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'booking_edited_by_admin', 'bookings', p_booking_id,
          jsonb_build_object('room_id', v_b.room_id, 'starts_at', v_b.starts_at, 'ends_at', v_b.ends_at, 'hours', v_b.hours_charged),
          jsonb_build_object('room_id', p_room_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'hours', v_new_hours,
                             'card_delta', case when v_b.source = 'punch_card' then v_delta end));
  return p_booking_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 2. materialize: מפגש ססיה לא נוצר על חסימת חדר (תחזוקה וכו') — אותה בדיקה
--    ש-admin_create_booking עושה מאז 14/10. המפגש מדולג ונרשם ביומן (ולא
--    נוצר "מעל" החסימה). אין יותר חסימות Skedda במערכת (נבדק 31/10), כך שזה
--    לא משפיע על קליטת ססיות מ-Skedda.
create or replace function materialize_subscription_bookings(p_subscription_id uuid, p_horizon_days integer)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_slot record;
  v_offset int;
  v_occ_date date;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_hours numeric;
begin
  perform assert_service_or_admin();

  select * into v_sub from session_subscriptions where id = p_subscription_id;
  if not found then
    return;
  end if;
  if v_sub.status not in ('active', 'pending_cancellation') then
    return;
  end if;

  for v_slot in select * from session_slots where subscription_id = p_subscription_id loop
    v_hours := extract(epoch from (v_slot.end_time - v_slot.start_time)) / 3600;

    for v_offset in 0..(p_horizon_days - 1) loop
      v_occ_date := current_date + v_offset;
      if extract(dow from v_occ_date) <> v_slot.weekday then
        continue;
      end if;
      if v_sub.start_date is not null and v_occ_date < v_sub.start_date then
        continue;
      end if;
      if v_sub.effective_end_date is not null and v_occ_date > v_sub.effective_end_date then
        continue;
      end if;
      if v_slot.valid_from is not null and v_occ_date < v_slot.valid_from then
        continue;
      end if;
      if v_slot.valid_until is not null and v_occ_date > v_slot.valid_until then
        continue;
      end if;

      v_starts_at := (v_occ_date::text || ' ' || v_slot.start_time::text)::timestamp at time zone 'Asia/Jerusalem';
      v_ends_at := (v_occ_date::text || ' ' || v_slot.end_time::text)::timestamp at time zone 'Asia/Jerusalem';

      -- שורה קיימת (גם מבוטלת) חוסמת יצירה מחדש — כך ביטול/הזזה של מפגש בודד
      -- נשארים. חריג: מפגשים שבוטלו כי המשבצת הסתיימה או כי המנוי הסתיים —
      -- אם המשבצת/המנוי חוזרים, הם נוצרים מחדש.
      if exists (
        select 1 from bookings
        where subscription_id = p_subscription_id
          and room_id = v_slot.room_id
          and starts_at = v_starts_at
          and not (status <> 'confirmed'
                   and coalesce(admin_note, '') in ('סוף משבצת (ניהול ססיות)', 'סוף מנוי'))
      ) then
        continue;
      end if;

      if exists (
        select 1 from room_blocks
        where room_id = v_slot.room_id
          and tstzrange(starts_at, ends_at, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
      ) then
        insert into audit_log (actor_id, action, entity, entity_id, after)
        values (null, 'session_materialization_blocked', 'session_subscriptions', p_subscription_id,
                jsonb_build_object('room_id', v_slot.room_id, 'starts_at', v_starts_at, 'ends_at', v_ends_at));
        continue;
      end if;

      begin
        insert into bookings (user_id, room_id, source, subscription_id, starts_at, ends_at, hours_charged)
        values (v_sub.user_id, v_slot.room_id, 'session', p_subscription_id, v_starts_at, v_ends_at, v_hours);
      exception when exclusion_violation then
        insert into audit_log (actor_id, action, entity, entity_id, after)
        values (null, 'session_materialization_conflict', 'session_subscriptions', p_subscription_id,
                jsonb_build_object('room_id', v_slot.room_id, 'starts_at', v_starts_at, 'ends_at', v_ends_at));
      end;
    end loop;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- 3. אירועי זמינות (Realtime): הזזת הזמנה שנשארת confirmed (שינוי ע"י
--    מטפל/ת, עריכת אדמין) לא שלחה אירוע — לוחות פתוחים של מטפלים אחרים
--    הציגו את המשבצת הישנה כתפוסה והחדשה כפנויה עד רענון.
create or replace function emit_booking_availability_event()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (new.room_id, new.starts_at, new.ends_at, 'booked', 'insert');
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'confirmed' and new.status <> 'confirmed' then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (old.room_id, old.starts_at, old.ends_at, 'booked', 'delete');
    elsif old.status <> 'confirmed' and new.status = 'confirmed' then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (new.room_id, new.starts_at, new.ends_at, 'booked', 'insert');
    elsif new.status = 'confirmed'
          and (old.room_id, old.starts_at, old.ends_at) is distinct from (new.room_id, new.starts_at, new.ends_at) then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (old.room_id, old.starts_at, old.ends_at, 'booked', 'delete'),
             (new.room_id, new.starts_at, new.ends_at, 'booked', 'insert');
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'confirmed' then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (old.room_id, old.starts_at, old.ends_at, 'booked', 'delete');
    end if;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;
