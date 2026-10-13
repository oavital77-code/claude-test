-- בקליניקה — שיבוץ ידני מהלוח: בחירה אם לקזז מהכרטיסייה (14/10).
--
-- בקשת הבעלים: בכל שיבוץ ידני — סימון "לקזז ממכסת השעות" כן/לא.
-- גרסה חדשה של admin_create_booking עם p_charge (חובה, בלי default — כך אין
-- עמימות מול הגרסה הישנה בת 5 הפרמטרים, שנשארת כמו שהיא ולא מחייבת).
--
-- p_charge = true: אותה בחירת כרטיסייה כמו create_booking (FIFO, יתרה
-- מספיקה). אם אין — כמו אשראי שעות: הכרטיסייה עם התוקף הארוך ביותר יורדת
-- למינוס, ואם אין שום כרטיסייה נפתחת ריקה. האדמין החליט לחייב, אז לא חוסמים.
-- ההזמנה נשמרת כ-punch_card עם punch_card_id — ביטול מחזיר שעות כרגיל.
-- admin_note תמיד מלא בשיבוץ מחויב: הדשבורד ("הזמנות חדשות היום") וביטול
-- שקט מהלוח מזהים כך שיבוץ אדמין לעומת הזמנה עצמית של מטפל/ת.
--
-- p_charge = false: בדיוק כמו קודם — admin_comp בלי חיוב.

create or replace function admin_create_booking(
  p_user_id uuid,
  p_room_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_note text,
  p_charge boolean
)
returns table (booking_id uuid) as $$
declare
  v_room_active boolean;
  v_booking_id uuid;
  v_hours numeric;
  v_card punch_cards%rowtype;
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

  v_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600;

  if p_charge then
    select * into v_card from punch_cards
    where user_id = p_user_id and active and expires_at > p_ends_at
      and punch_cards.hours_remaining >= v_hours
      and deposit_remaining = deposit_amount
    order by expires_at asc
    limit 1
    for update;

    if not found then
      select * into v_card from punch_cards
      where user_id = p_user_id and active and expires_at > p_ends_at
      order by expires_at desc
      limit 1
      for update;

      if not found then
        insert into punch_cards (
          user_id, tier_id, hours_purchased, hours_remaining,
          price_per_hour, deposit_amount, deposit_remaining, expires_at, active
        ) values (
          p_user_id, null, 0, 0, 0, 0, 0, now() + interval '12 months', true
        ) returning * into v_card;
      end if;
    end if;

    update punch_cards set hours_remaining = punch_cards.hours_remaining - v_hours where id = v_card.id;
  end if;

  begin
    insert into bookings (user_id, room_id, source, punch_card_id, starts_at, ends_at, hours_charged, admin_note)
    values (
      p_user_id, p_room_id,
      case when p_charge then 'punch_card'::booking_source else 'admin_comp'::booking_source end,
      case when p_charge then v_card.id end,
      p_starts_at, p_ends_at, v_hours,
      case when p_charge then coalesce(nullif(p_note, ''), 'שובץ ע"י אדמין') else p_note end
    )
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'booking_created_by_admin', 'bookings', v_booking_id,
          jsonb_build_object('user_id', p_user_id, 'room_id', p_room_id, 'charged', p_charge,
                             'punch_card_id', case when p_charge then v_card.id end, 'hours', v_hours));

  return query select v_booking_id;
end;
$$ language plpgsql security definer set search_path = public;
