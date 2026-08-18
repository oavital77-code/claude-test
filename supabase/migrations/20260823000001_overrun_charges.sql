-- בקליניקה — רישום חריגות (M6)
-- ר' baclinica-spec.md §3.5, §6.8. אדמין בלבד — המערכת לא מזהה חריגות אוטומטית.

-- ═══ תצוגה מקדימה (read-only) — למסך "רישום חריגה" לפני אישור ═══
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
    select price_per_hour into v_price from punch_card_tiers where active order by hours desc limit 1;
  end if;

  v_amount := v_hours * coalesce(v_price, 0);

  return query select
    v_hours, v_price, v_amount,
    coalesce(v_card.deposit_remaining, 0),
    coalesce(v_card.deposit_remaining, 0) < v_amount;
end;
$$ language plpgsql security definer stable;

-- ═══ רישום חריגה בפועל ═══
-- ניכוי פיקדון מתבצע כאן ומיידי. חיוב כרטיס (כשאין פיקדון מספיק) יוצר
-- payment ב-pending; ההשלמה קורית ב-finalize_overrun_charge אחרי קריאת
-- PayPlus מהאפליקציה (חיוב הוא HTTP, לא יכול לקרות בתוך הטרנזקציה הזו).
create or replace function record_overrun(p_booking_id uuid, p_minutes int, p_note text)
returns table (overrun_id uuid, amount numeric, source overrun_source, payment_id uuid) as $$
declare
  v_booking bookings%rowtype;
  v_card punch_cards%rowtype;
  v_hours numeric;
  v_price numeric;
  v_amount numeric;
  v_source overrun_source;
  v_payment_id uuid := null;
  v_vat_rate numeric;
  v_overrun_id uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'INVALID_SLOT';
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  v_hours := ceil(p_minutes::numeric / 30) / 2;

  if v_booking.punch_card_id is not null then
    select * into v_card from punch_cards where id = v_booking.punch_card_id for update;
  else
    select * into v_card from punch_cards
    where user_id = v_booking.user_id and active order by expires_at asc limit 1 for update;
  end if;

  if found then
    v_price := v_card.price_per_hour;
  else
    select price_per_hour into v_price from punch_card_tiers where active order by hours desc limit 1;
  end if;

  v_amount := v_hours * coalesce(v_price, 0);

  if found and v_card.deposit_remaining >= v_amount then
    update punch_cards set deposit_remaining = deposit_remaining - v_amount where id = v_card.id;
    v_source := 'deposit';
  else
    v_source := 'charge';
    select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
    v_vat_rate := coalesce(v_vat_rate, 0.18);

    insert into payments (user_id, type, status, amount_before_vat, vat_amount, amount_total)
    values (
      v_booking.user_id, 'overrun', 'pending',
      v_amount, round(v_amount * v_vat_rate, 2), v_amount + round(v_amount * v_vat_rate, 2)
    )
    returning id into v_payment_id;
  end if;

  insert into overrun_charges (user_id, booking_id, minutes, hours_charged, amount, source, payment_id, recorded_by, note)
  values (v_booking.user_id, p_booking_id, p_minutes, v_hours, v_amount, v_source, v_payment_id, auth.uid(), p_note)
  returning id into v_overrun_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'overrun_recorded', 'overrun_charges', v_overrun_id,
          jsonb_build_object('amount', v_amount, 'source', v_source));

  return query select v_overrun_id, v_amount, v_source, v_payment_id;
end;
$$ language plpgsql security definer;

-- ═══ סגירת תוצאת חיוב חריגה (כשאין פיקדון מספיק) ═══
-- הצלחה → מסמן שולם. כישלון → משעה את המטפל (כמו כישלון חידוש ססיה, §6.7),
-- כי אין דרך אחרת לחסום הזמנות חדשות כשאין כרטיסייה עם פיקדון לנכות ממנו.
create or replace function finalize_overrun_charge(
  p_payment_id uuid,
  p_success boolean,
  p_transaction_uid text default null,
  p_reason text default null
)
returns void as $$
declare
  v_payment payments%rowtype;
begin
  perform assert_service_or_admin();

  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.type <> 'overrun' then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_payment.status <> 'pending' then
    return; -- אידמפוטנטיות
  end if;

  if p_success then
    update payments
    set status = 'paid', payplus_transaction_uid = p_transaction_uid, paid_at = now()
    where id = p_payment_id;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (v_payment.user_id, 'overrun_charge_succeeded', 'payments', p_payment_id, '{}'::jsonb);
  else
    update payments set status = 'failed', failure_reason = p_reason where id = p_payment_id;
    update profiles set status = 'suspended' where id = v_payment.user_id;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (v_payment.user_id, 'overrun_charge_failed_suspended', 'payments', p_payment_id,
            jsonb_build_object('reason', p_reason));
  end if;
end;
$$ language plpgsql security definer;
