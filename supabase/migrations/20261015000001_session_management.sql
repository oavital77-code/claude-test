-- בקליניקה — ניהול ססיות ע"י אדמין (15/10).
--
-- בקשת הבעלים: לשונית "ניהול ססיות" — מטפלים כל הזמן מבקשים להזיז ימים
-- ושעות, לבטל ססיה, להחליף לכרטיסייה. צריך לשנות "מתאריך X" בלי לגעת במה
-- שכבר היה לפניו.
--
-- מודל: לכל משבצת (session_slots) טווח תוקף — valid_from / valid_until
-- (null = בלי הגבלה). materialize_subscription_bookings מכבד אותו. כך:
--   • שינוי יום/שעה/חדר מתאריך X = המשבצת הישנה נגמרת ב-X−1 (המפגשים שלה
--     מ-X מבוטלים), ומשבצת חדשה מתחילה ב-X.
--   • הסרת משבצת מ-X / הוספת משבצת מ-X — אותו עיקרון.
--   • ביטול ססיה מ-X = effective_end_date = X−1 + ביטול המפגשים מ-X.
--   • הזזת מפגש בודד = ביטול המפגש (נשאר כ"מצבה" — materialize בודק קיום
--     שורה לפי שעת המשבצת, כך שלא ייווצר מחדש) + מפגש ססיה חדש במועד אחר.
-- שום פעולה כאן לא שולחת מייל ולא יוצרת תשלום.

alter table session_slots add column if not exists valid_from date;
alter table session_slots add column if not exists valid_until date;

-- ═══ materialize — כמו קודם + טווח התוקף של המשבצת ═══
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
      -- נשארים. חריג: מפגשים שבוטלו כי המשבצת הסתיימה (שינוי שעות) — אם
      -- המשבצת חוזרת בהמשך לאותה שעה, הם נוצרים מחדש.
      if exists (
        select 1 from bookings
        where subscription_id = p_subscription_id
          and room_id = v_slot.room_id
          and starts_at = v_starts_at
          -- is not distinct from: admin_note הוא NULL ברוב השורות — '=' היה מחזיר NULL
          -- והופך את כל ה-NOT ל-NULL, כלומר כל מצבה רגילה הייתה "נעלמת" ונוצרת מחדש.
          and not (status <> 'confirmed' and admin_note is not distinct from 'סוף משבצת (ניהול ססיות)')
      ) then
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

-- ═══ עזר פנימי: ביטול מפגשי משבצת מתאריך ═══
create or replace function cancel_slot_bookings_from(p_slot_id uuid, p_from date)
returns integer as $$
declare
  v_slot session_slots%rowtype;
  v_count integer;
begin
  select * into v_slot from session_slots where id = p_slot_id;
  update bookings
  set status = 'cancelled_by_admin', cancelled_at = now(), cancelled_by = auth.uid(), hours_refunded = false,
      admin_note = 'סוף משבצת (ניהול ססיות)'
  where subscription_id = v_slot.subscription_id
    and status = 'confirmed'
    and room_id = v_slot.room_id
    and extract(dow from (starts_at at time zone 'Asia/Jerusalem'))::int = v_slot.weekday
    and (starts_at at time zone 'Asia/Jerusalem')::time = v_slot.start_time
    and (starts_at at time zone 'Asia/Jerusalem')::date >= p_from;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function cancel_slot_bookings_from(uuid, date) from public, anon, authenticated;

-- ═══ עזר פנימי: ולידציית משבצת ═══
create or replace function assert_valid_session_slot(p_room_id uuid, p_weekday integer, p_start time, p_end time)
returns void as $$
begin
  if p_weekday not between 0 and 6 or p_end <= p_start then
    raise exception 'INVALID_SLOT';
  end if;
  if extract(epoch from p_start)::int % 1800 <> 0 or extract(epoch from p_end)::int % 1800 <> 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if not exists (select 1 from rooms where id = p_room_id and active) then
    raise exception 'ROOM_UNAVAILABLE';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function assert_valid_session_slot(uuid, integer, time, time) from public, anon, authenticated;

-- ═══ עזר פנימי: שעות שבועיות = המשבצות הקבועות (בלי סוף); אם כולן מסתיימות — מה שבתוקף היום ═══
create or replace function refresh_session_weekly_hours(p_subscription_id uuid)
returns void as $$
declare
  v_hours numeric;
begin
  select sum(extract(epoch from (end_time - start_time)) / 3600) into v_hours
  from session_slots
  where subscription_id = p_subscription_id and valid_until is null;

  if coalesce(v_hours, 0) = 0 then
    select sum(extract(epoch from (end_time - start_time)) / 3600) into v_hours
    from session_slots
    where subscription_id = p_subscription_id
      and (valid_from is null or valid_from <= current_date)
      and valid_until >= current_date;
  end if;

  update session_subscriptions set weekly_hours = coalesce(v_hours, 0) where id = p_subscription_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function refresh_session_weekly_hours(uuid) from public, anon, authenticated;

-- ═══ שינוי משבצת (יום/שעה/חדר) החל מתאריך ═══
create or replace function admin_session_change_slot(
  p_slot_id uuid, p_room_id uuid, p_weekday integer, p_start_time time, p_end_time time, p_from date
)
returns table (cancelled integer, conflicts integer) as $$
declare
  v_old session_slots%rowtype;
  v_sub session_subscriptions%rowtype;
  v_new_id uuid;
  v_cancelled integer;
  v_conflicts integer;
  v_t0 timestamptz := now();
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  perform assert_valid_session_slot(p_room_id, p_weekday, p_start_time, p_end_time);

  select * into v_old from session_slots where id = p_slot_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_sub from session_subscriptions where id = v_old.subscription_id for update;
  if v_sub.status not in ('active', 'pending_cancellation') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;
  if p_from is null or p_from < current_date then
    raise exception 'INVALID_START_DATE';
  end if;

  v_cancelled := cancel_slot_bookings_from(p_slot_id, p_from);
  update session_slots set valid_until = p_from - 1 where id = p_slot_id;

  insert into session_slots (subscription_id, room_id, weekday, start_time, end_time, valid_from, valid_until)
  values (v_old.subscription_id, p_room_id, p_weekday, p_start_time, p_end_time,
          greatest(p_from, coalesce(v_old.valid_from, p_from)), v_old.valid_until)
  returning id into v_new_id;

  perform refresh_session_weekly_hours(v_old.subscription_id);
  perform materialize_subscription_bookings(v_old.subscription_id, 90);

  select count(*) into v_conflicts from audit_log
  where action = 'session_materialization_conflict' and entity_id = v_old.subscription_id and created_at >= v_t0;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_slot_changed_by_admin', 'session_subscriptions', v_old.subscription_id,
          jsonb_build_object('old_slot', p_slot_id, 'new_slot', v_new_id, 'from', p_from,
                             'room_id', p_room_id, 'weekday', p_weekday, 'start', p_start_time, 'end', p_end_time,
                             'cancelled', v_cancelled, 'conflicts', v_conflicts));

  return query select v_cancelled, v_conflicts;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ הסרת משבצת החל מתאריך ═══
create or replace function admin_session_remove_slot(p_slot_id uuid, p_from date)
returns integer as $$
declare
  v_slot session_slots%rowtype;
  v_cancelled integer;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_slot from session_slots where id = p_slot_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if p_from is null or p_from < current_date then
    raise exception 'INVALID_START_DATE';
  end if;

  v_cancelled := cancel_slot_bookings_from(p_slot_id, p_from);
  update session_slots set valid_until = p_from - 1 where id = p_slot_id;
  perform refresh_session_weekly_hours(v_slot.subscription_id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_slot_removed_by_admin', 'session_subscriptions', v_slot.subscription_id,
          jsonb_build_object('slot', p_slot_id, 'from', p_from, 'cancelled', v_cancelled));
  return v_cancelled;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ הוספת משבצת החל מתאריך ═══
create or replace function admin_session_add_slot_from(
  p_subscription_id uuid, p_room_id uuid, p_weekday integer, p_start_time time, p_end_time time, p_from date
)
returns table (conflicts integer) as $$
declare
  v_sub session_subscriptions%rowtype;
  v_new_id uuid;
  v_conflicts integer;
  v_t0 timestamptz := now();
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  perform assert_valid_session_slot(p_room_id, p_weekday, p_start_time, p_end_time);
  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'pending_cancellation') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;
  if p_from is null or p_from < current_date then
    raise exception 'INVALID_START_DATE';
  end if;

  insert into session_slots (subscription_id, room_id, weekday, start_time, end_time, valid_from)
  values (p_subscription_id, p_room_id, p_weekday, p_start_time, p_end_time, p_from)
  returning id into v_new_id;

  perform refresh_session_weekly_hours(p_subscription_id);
  perform materialize_subscription_bookings(p_subscription_id, 90);

  select count(*) into v_conflicts from audit_log
  where action = 'session_materialization_conflict' and entity_id = p_subscription_id and created_at >= v_t0;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_slot_added_by_admin', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('slot', v_new_id, 'from', p_from, 'conflicts', v_conflicts));
  return query select v_conflicts;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ ביטול ססיה החל מתאריך ═══
create or replace function admin_session_cancel(p_subscription_id uuid, p_from date)
returns integer as $$
declare
  v_sub session_subscriptions%rowtype;
  v_cancelled integer;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'pending_cancellation', 'awaiting_payment', 'requested') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;
  if p_from is null then
    p_from := current_date;
  end if;

  update bookings
  set status = 'cancelled_by_admin', cancelled_at = now(), cancelled_by = auth.uid(), hours_refunded = false
  where subscription_id = p_subscription_id and status = 'confirmed'
    and (starts_at at time zone 'Asia/Jerusalem')::date >= p_from;
  get diagnostics v_cancelled = row_count;

  update session_subscriptions
  set effective_end_date = p_from - 1,
      status = case when p_from <= current_date then 'cancelled'::sub_status else status end
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_cancelled_by_admin', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('from', p_from, 'cancelled_bookings', v_cancelled));
  return v_cancelled;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ הזזת מפגש בודד ═══
create or replace function admin_session_move_occurrence(
  p_booking_id uuid, p_room_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid as $$
declare
  v_b bookings%rowtype;
  v_new_id uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_b from bookings where id = p_booking_id for update;
  if not found or v_b.source <> 'session' or v_b.status <> 'confirmed' then
    raise exception 'BOOKING_PASSED';
  end if;
  if p_ends_at <= p_starts_at
     or extract(epoch from p_starts_at)::bigint % 1800 <> 0
     or extract(epoch from p_ends_at)::bigint % 1800 <> 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if not exists (select 1 from rooms where id = p_room_id and active) then
    raise exception 'ROOM_UNAVAILABLE';
  end if;

  -- המפגש המקורי מבוטל ונשאר כשורה — כך ה-materialize הלילי לא יוצר אותו מחדש.
  update bookings
  set status = 'cancelled_by_admin', cancelled_at = now(), cancelled_by = auth.uid(), hours_refunded = false
  where id = p_booking_id;

  if exists (
    select 1 from room_blocks
    where room_id = p_room_id and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'ROOM_BLOCKED';
  end if;
  if exists (
    select 1 from bookings
    where user_id = v_b.user_id and status = 'confirmed'
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'SELF_OVERLAP';
  end if;

  begin
    insert into bookings (user_id, room_id, source, subscription_id, starts_at, ends_at, hours_charged, admin_note)
    values (v_b.user_id, p_room_id, 'session', v_b.subscription_id, p_starts_at, p_ends_at,
            extract(epoch from (p_ends_at - p_starts_at)) / 3600, 'מפגש ססיה שהוזז ע"י אדמין')
    returning id into v_new_id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_occurrence_moved_by_admin', 'bookings', p_booking_id,
          jsonb_build_object('new_booking', v_new_id, 'room_id', p_room_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  return v_new_id;
end;
$$ language plpgsql security definer set search_path = public;
