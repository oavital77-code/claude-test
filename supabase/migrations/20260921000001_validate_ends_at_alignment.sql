-- create_booking בדק יישור ל-30 דקות על p_starts_at בלבד. p_ends_at נבדק רק
-- לטווח המשך (>= 30 דקות, <= 8 שעות) — לא ליישור. התוצאה: קריאה ישירה ל-RPC
-- עם 09:00→09:45 עברה את כל הבדיקות וחייבה 0.75 שעות, והשאירה את 09:45–10:00
-- בלתי-שמיש לכל אחד אחר (כל שאר ההזמנות חייבות להתחיל על :00/:30).
--
-- ה-UI תמיד שולח ערכים עגולים, ולכן זה לא נצפה בפועל — אבל Server Action
-- זמין לכל משתמש מחובר עם ארגומנטים שרירותיים, וחוק ה-30 דקות
-- (CLAUDE.md §8) חייב להיאכף במקום שבו הוא באמת נאכף: ב-DB.
--
-- שינוי יחיד מול הגרסה הקודמת (20260828000012): הוספת בדיקת היישור על
-- p_ends_at. כל שאר הלוגיקה — חלון רטרואקטיבי, FIFO, פיקדון, FOR UPDATE —
-- זהה בדיוק.

create or replace function create_booking(
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (
  booking_id uuid,
  hours_charged numeric,
  hours_remaining numeric
) as $$
declare
  v_uid uuid := auth.uid();
  v_status user_status;
  v_hours numeric;
  v_horizon_days int;
  v_room_active boolean;
  v_card punch_cards%rowtype;
  v_has_hours boolean;
  v_booking_id uuid;
  v_is_retroactive boolean;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ולידציות זמן (§3.7). שני הקצוות חייבים להיות מיושרים ל-30 דקות.
  if extract(epoch from p_starts_at)::bigint % 1800 <> 0
     or extract(epoch from p_ends_at)::bigint % 1800 <> 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if p_ends_at <= p_starts_at
     or p_ends_at - p_starts_at < interval '30 minutes'
     or p_ends_at - p_starts_at > interval '8 hours' then
    raise exception 'INVALID_SLOT';
  end if;
  if p_starts_at <= now() - interval '30 days' then
    raise exception 'TOO_FAR_PAST';
  end if;
  v_is_retroactive := p_starts_at <= now();

  select (value#>>'{}')::int into v_horizon_days from app_settings where key = 'booking_horizon_days';
  v_horizon_days := coalesce(v_horizon_days, 30);
  if p_starts_at > now() + (v_horizon_days || ' days')::interval then
    raise exception 'TOO_FAR_AHEAD';
  end if;

  -- ולידציית משתמש
  select status into v_status from profiles where id = v_uid;
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  -- חפיפה עצמית
  if exists (
    select 1 from bookings
    where user_id = v_uid and status = 'confirmed'
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'SELF_OVERLAP';
  end if;

  -- זמינות החדר
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

  -- בחירת כרטיסייה — FIFO, פיקדון שלם, עם נעילת שורה (§6.1)
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

  update punch_cards set hours_remaining = punch_cards.hours_remaining - v_hours where id = v_card.id;

  begin
    insert into bookings (user_id, room_id, source, punch_card_id, starts_at, ends_at, hours_charged)
    values (v_uid, p_room_id, 'punch_card', v_card.id, p_starts_at, p_ends_at, v_hours)
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (
    v_uid,
    case when v_is_retroactive then 'booking_created_retroactively' else 'booking_created' end,
    'bookings', v_booking_id,
    jsonb_build_object('room_id', p_room_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'hours', v_hours)
  );

  return query
    select v_booking_id, v_hours, (v_card.hours_remaining - v_hours);
end;
$$ language plpgsql security definer set search_path = public;
