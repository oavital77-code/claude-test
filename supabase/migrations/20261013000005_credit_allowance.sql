-- בקליניקה — אשראי שעות למטפלים מסוימים (13/10).
--
-- החלטת הבעלים במעבר מ-Skedda: מטפלים שנכנסו למינוס (התחייבנו להם לשעות)
-- ממשיכים לקבוע בעצמם כרגיל — "המטרה היא לא לחסום אותם, נתחשבן איתם".
-- זו חריגה מפורשת ומבוקרת מחוק #7 (אין הזמנה בלי יתרה), **רק** למי שאדמין
-- סימן בטבלה therapist_credit_allowance. כל השאר — בדיוק כמו קודם.
--
-- create_booking: קודם הבחירה הרגילה (FIFO, יתרה מספיקה). רק אם אין כזו
-- ולמטפל/ת יש אשראי — מחייבים את הכרטיסייה הפעילה עם התוקף הארוך ביותר
-- (גם לתוך מינוס), ואם אין שום כרטיסייה — נפתחת כרטיסייה ריקה (0 ש').
-- החוב מתקזז אוטומטית ברכישה הבאה (absorb_punch_card_debt, 20261013000004).
--
-- הטבלה נפרדת מ-profiles בכוונה: עמודה ב-profiles הייתה ניתנת לעדכון ע"י
-- המטפל/ת עצמו/ה (edit_profile) אלא אם מוסיפים אותה ל-privilege guard.

create table if not exists therapist_credit_allowance (
  user_id uuid primary key references profiles(id),
  allowed boolean not null default true,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  note text
);

alter table therapist_credit_allowance enable row level security;

create policy credit_allowance_admin_all on therapist_credit_allowance
  for all using (is_admin()) with check (is_admin());

create policy credit_allowance_read_own on therapist_credit_allowance
  for select using (user_id = auth.uid());

create or replace function admin_set_credit_allowance(p_user_id uuid, p_allowed boolean)
returns void as $$
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  insert into therapist_credit_allowance (user_id, allowed, granted_by)
  values (p_user_id, p_allowed, auth.uid())
  on conflict (user_id) do update
    set allowed = excluded.allowed, granted_by = excluded.granted_by, granted_at = now();

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'credit_allowance_set', 'profiles', p_user_id, jsonb_build_object('allowed', p_allowed));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function create_booking(p_room_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
returns table (booking_id uuid, hours_charged numeric, hours_remaining numeric) as $$
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
  v_on_credit boolean := false;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN';
  end if;

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

  select status into v_status from profiles where id = v_uid;
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  if exists (
    select 1 from bookings
    where user_id = v_uid and status = 'confirmed'
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
        insert into punch_cards (
          user_id, tier_id, hours_purchased, hours_remaining,
          price_per_hour, deposit_amount, deposit_remaining, expires_at, active
        ) values (
          v_uid, null, 0, 0, 0, 0, 0, now() + interval '12 months', true
        ) returning * into v_card;
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
    jsonb_build_object('room_id', p_room_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'hours', v_hours,
                       'on_credit', v_on_credit)
  );

  return query
    select v_booking_id, v_hours, (v_card.hours_remaining - v_hours);
end;
$$ language plpgsql security definer set search_path = public;
