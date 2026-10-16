-- שינוי הזמנה ע"י המטפל/ת (16/10) — במקום ביטול + קביעה מחדש.
--
-- חוקיות (החלטת הבעלים):
--   • רק הזמנת כרטיסייה (source='punch_card'). ססיה — לעולם לא (חוק #4),
--     שיבוץ אדמין חינמי (admin_comp) — לא.
--   • אותו חלון כמו ביטול: ההזמנה ה*מקורית* חייבת להתחיל בעוד לפחות
--     cancel_window_hours (app_settings) — אחרת RESCHEDULE_WINDOW_PASSED.
--     בלי זה אפשר היה "לברוח" מביטול מאוחר דרך שינוי.
--   • המועד ה*חדש* — אותן בדיקות כמו create_booking (יישור 30 דק', 30 דק'–8
--     ש', טווח ימים, חדר פעיל, חסימה, חפיפה עצמית, יתרה/אשראי), רק לא בעבר.
--     מותר גם בתוך החלון (כמו הזמנה חדשה).
--   • שעות: ההזמנה הישנה "מוחזרת" לכרטיסייה שלה והחדשה מחויבת באותה בחירת
--     FIFO של create_booking — הכל בטרנזקציה אחת. כל כשל (חדר תפוס, אין
--     יתרה) מבטל הכל, וההזמנה המקורית נשארת כמו שהייתה.

create or replace function reschedule_booking(
  p_booking_id uuid, p_room_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
)
returns table (booking_id uuid, hours_charged numeric, hours_delta numeric) as $$
declare
  v_uid uuid := auth.uid();
  v_status user_status;
  v_old bookings%rowtype;
  v_window numeric;
  v_horizon_days int;
  v_room_active boolean;
  v_hours numeric;
  v_card punch_cards%rowtype;
  v_has_hours boolean;
  v_on_credit boolean := false;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_old from bookings where id = p_booking_id and user_id = v_uid for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if v_old.status <> 'confirmed' or v_old.starts_at <= now() then
    raise exception 'BOOKING_PASSED';
  end if;
  if v_old.source = 'session' then
    raise exception 'SESSION_NOT_CANCELLABLE';
  end if;
  if v_old.source <> 'punch_card' or v_old.punch_card_id is null then
    raise exception 'NOT_RESCHEDULABLE';
  end if;

  select (value#>>'{}')::numeric into v_window from app_settings where key = 'cancel_window_hours';
  v_window := coalesce(v_window, 24);
  if extract(epoch from (v_old.starts_at - now())) / 3600 < v_window then
    raise exception 'RESCHEDULE_WINDOW_PASSED';
  end if;

  -- המועד החדש — כמו create_booking
  if extract(epoch from p_starts_at)::bigint % 1800 <> 0
     or extract(epoch from p_ends_at)::bigint % 1800 <> 0
     or p_ends_at <= p_starts_at
     or p_ends_at - p_starts_at < interval '30 minutes'
     or p_ends_at - p_starts_at > interval '8 hours' then
    raise exception 'INVALID_SLOT';
  end if;
  if p_starts_at <= now() then
    raise exception 'BOOKING_PASSED';
  end if;
  select (value#>>'{}')::int into v_horizon_days from app_settings where key = 'booking_horizon_days';
  v_horizon_days := coalesce(v_horizon_days, 30);
  if p_starts_at > now() + (v_horizon_days || ' days')::interval then
    raise exception 'TOO_FAR_AHEAD';
  end if;

  select status into v_status from profiles where id = v_uid;
  if v_status is distinct from 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  if exists (
    select 1 from bookings
    where user_id = v_uid and status = 'confirmed' and id <> p_booking_id
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'SELF_OVERLAP';
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
    raise exception 'ROOM_UNAVAILABLE';
  end if;

  v_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600;

  -- מחזירים את שעות ההזמנה הישנה לכרטיסייה שלה (אנחנו מחוץ לחלון הביטול)
  update punch_cards set hours_remaining = hours_remaining + v_old.hours_charged
  where id = v_old.punch_card_id;

  -- ומחייבים את החדשה — אותה בחירה בדיוק כמו create_booking
  select * into v_card from punch_cards
  where user_id = v_uid
    and active
    and expires_at > p_ends_at
    and punch_cards.hours_remaining >= v_hours
    and deposit_remaining = deposit_amount
  order by expires_at asc
  limit 1
  for update;

  if not found then
    if exists (select 1 from therapist_credit_allowance where user_id = v_uid and allowed) then
      v_on_credit := true;
      select * into v_card from punch_cards
      where user_id = v_uid and active and expires_at > p_ends_at
      order by expires_at desc
      limit 1
      for update;
      if not found then
        raise exception 'NO_CREDIT';
      end if;
    else
      select exists (
        select 1 from punch_cards
        where user_id = v_uid and active and expires_at > p_ends_at and punch_cards.hours_remaining >= v_hours
      ) into v_has_hours;
      if v_has_hours then
        raise exception 'DEPOSIT_DEPLETED';
      else
        raise exception 'NO_CREDIT';
      end if;
    end if;
  end if;

  update punch_cards set hours_remaining = punch_cards.hours_remaining - v_hours where id = v_card.id;

  begin
    update bookings
    set room_id = p_room_id,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        hours_charged = v_hours,
        punch_card_id = v_card.id,
        reminder_sent_at = null
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    v_uid, 'booking_rescheduled', 'bookings', p_booking_id,
    jsonb_build_object('room_id', v_old.room_id, 'starts_at', v_old.starts_at, 'ends_at', v_old.ends_at, 'hours', v_old.hours_charged),
    jsonb_build_object('room_id', p_room_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'hours', v_hours,
                       'on_credit', v_on_credit)
  );

  return query select p_booking_id, v_hours, v_hours - v_old.hours_charged;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function reschedule_booking(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function reschedule_booking(uuid, uuid, timestamptz, timestamptz) to authenticated;
