-- המשך תיקון 20260827000003: הפתרון הקודם טיפל רק ב-UPDATE של create_booking,
-- אבל פספס שני מופעים נוספים באותה פונקציה (בתוך ה-SELECT שבוחר/בודק כרטיסייה,
-- שקורה *לפני* ה-UPDATE) — ולכן השגיאה המשיכה להופיע. בנוסף, סריקה מלאה של
-- כל select-into ב-DB (לא רק update-set) מצאה מופע נוסף מאותה מחלקת באג ב-
-- preview_overrun: הפולבאק לתמחור ברירת מחדל (כשאין כרטיסייה פעילה למטפל)
-- משתמש ב-price_per_hour/hours ללא הכשרה, וגם הם מתנגשים עם עמודות הפלט
-- הסינטטיות של הפונקציה עצמה (RETURNS TABLE(hours numeric, price_per_hour
-- numeric, ...)). מכשירים את שני המקומות במפורש הפעם.

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
begin
  if v_uid is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ולידציות זמן (§3.7)
  if extract(epoch from p_starts_at)::bigint % 1800 <> 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if p_ends_at <= p_starts_at
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
  values (v_uid, 'booking_created', 'bookings', v_booking_id,
          jsonb_build_object('room_id', p_room_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'hours', v_hours));

  return query
    select v_booking_id, v_hours, (v_card.hours_remaining - v_hours);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function preview_overrun(p_booking_id uuid, p_minutes int)
returns table (
  hours numeric,
  price_per_hour numeric,
  amount numeric,
  deposit_available numeric,
  needs_charge boolean
) as $$
declare
  v_booking bookings%rowtype;
  v_card punch_cards%rowtype;
  v_hours numeric;
  v_price numeric;
  v_amount numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  v_hours := ceil(greatest(p_minutes, 0)::numeric / 30) / 2;

  if v_booking.punch_card_id is not null then
    select * into v_card from punch_cards where id = v_booking.punch_card_id;
  else
    select * into v_card from punch_cards
    where user_id = v_booking.user_id and active order by expires_at asc limit 1;
  end if;

  if found then
    v_price := v_card.price_per_hour;
  else
    select punch_card_tiers.price_per_hour into v_price
    from punch_card_tiers where active order by punch_card_tiers.hours desc limit 1;
  end if;

  v_amount := v_hours * coalesce(v_price, 0);

  return query select
    v_hours, v_price, v_amount,
    coalesce(v_card.deposit_remaining, 0),
    coalesce(v_card.deposit_remaining, 0) < v_amount;
end;
$$ language plpgsql security definer stable set search_path = public;
