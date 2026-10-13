-- בקליניקה — שיבוץ ידני מהלוח: חסימת התנגשויות שקטות (בדיקת טרום-השקה 13/10).
--
-- admin_create_booking בדק רק חפיפה מול הזמנות אחרות (ה-EXCLUDE). בבדיקה
-- נמצאו שתי התנגשויות שנוצרו מהלוח:
--   • הזמנה על גבי חסימת חדר (ססיה מ-Skedda של מטפלת אחרת) — אותו חדר
--     "תפוס" פעמיים.
--   • אותו/ה מטפל/ת בשני חדרים באותה שעה (ושעות חויבו פעמיים).
-- עכשיו שני המקרים נחסמים: ROOM_BLOCKED (למחוק קודם את החסימה בלוח אם
-- זה מכוון) ו-SELF_OVERLAP.

create or replace function admin_create_booking(
  p_user_id uuid,
  p_room_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_note text default null
)
returns table (booking_id uuid) as $$
declare
  v_room_active boolean;
  v_booking_id uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'INVALID_SLOT';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  select active into v_room_active from rooms where id = p_room_id;
  if v_room_active is null or not v_room_active then
    raise exception 'ROOM_UNAVAILABLE';
  end if;

  if exists (
    select 1 from room_blocks
    where room_id = p_room_id
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'ROOM_BLOCKED';
  end if;

  if exists (
    select 1 from bookings
    where user_id = p_user_id and status = 'confirmed'
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'SELF_OVERLAP';
  end if;

  begin
    insert into bookings (user_id, room_id, source, starts_at, ends_at, hours_charged, admin_note)
    values (p_user_id, p_room_id, 'admin_comp', p_starts_at, p_ends_at,
            extract(epoch from (p_ends_at - p_starts_at)) / 3600, p_note)
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'booking_created_by_admin', 'bookings', v_booking_id,
          jsonb_build_object('user_id', p_user_id, 'room_id', p_room_id));

  return query select v_booking_id;
end;
$$ language plpgsql security definer set search_path = public;
