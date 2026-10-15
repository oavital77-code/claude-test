-- בקליניקה — עריכת שיבוץ מהלוח (15/10): תאריך / שעות / חדר.
--
-- • כרטיסייה (punch_card): עדכון במקום; אם האורך השתנה — ההפרש יורד מאותה
--   כרטיסייה (גם למינוס — החלטת אדמין) או חוזר אליה.
-- • שיבוץ אדמין (admin_comp): עדכון במקום, בלי חיוב.
-- • מפגש ססיה: דרך admin_session_move_occurrence (ביטול + מפגש חדש), כדי
--   שה-materialize הלילי לא ייצור את המקורי מחדש.
-- אותן בדיקות כמו בשיבוץ חדש: חסימת חדר, חפיפה עצמית, חפיפה עם הזמנה אחרת.
-- בלי מייל.

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
    set room_id = p_room_id, starts_at = p_starts_at, ends_at = p_ends_at, hours_charged = v_new_hours
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
