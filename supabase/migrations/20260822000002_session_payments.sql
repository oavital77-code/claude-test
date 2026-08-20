-- בקליניקה — תשלום ראשון והפעלת ססיה (M5)
-- ר' baclinica-spec.md §6.5, §7.2 (ססיה מחייבת כרטיס אשראי + טוקן).

-- ═══ יצירת בקשת תשלום ראשון לססיה שאושרה ═══
create or replace function create_session_initial_payment(p_subscription_id uuid)
returns table (payment_id uuid, amount_total numeric) as $$
declare
  v_sub session_subscriptions%rowtype;
  v_vat_rate numeric;
  v_vat numeric;
  v_total numeric;
  v_payment_id uuid;
begin
  select * into v_sub from session_subscriptions
  where id = p_subscription_id and user_id = auth.uid();
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if v_sub.status <> 'awaiting_payment' then
    raise exception 'PAYMENT_REQUIRED';
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);

  v_vat := round(v_sub.monthly_price * v_vat_rate, 2);
  v_total := v_sub.monthly_price + v_vat;

  insert into payments (user_id, type, status, amount_before_vat, vat_amount, amount_total, subscription_id)
  values (auth.uid(), 'session_initial', 'pending', v_sub.monthly_price, v_vat, v_total, p_subscription_id)
  returning id into v_payment_id;

  return query select v_payment_id, v_total;
end;
$$ language plpgsql security definer;

-- ═══ מילוי bookings אמיתיים ממשבצות ססיה חוזרות, רולינג p_horizon_days קדימה ═══
-- קונפליקט EXCLUDE בודד לא מפיל את כל הריצה — נרשם ל-audit_log להתראת אדמין (§6.6, §13).
create or replace function materialize_subscription_bookings(p_subscription_id uuid, p_horizon_days int)
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
  select * into v_sub from session_subscriptions where id = p_subscription_id;
  if not found then
    return;
  end if;

  for v_slot in select * from session_slots where subscription_id = p_subscription_id loop
    v_hours := extract(epoch from (v_slot.end_time - v_slot.start_time)) / 3600;

    for v_offset in 0..(p_horizon_days - 1) loop
      v_occ_date := current_date + v_offset;
      if extract(dow from v_occ_date) <> v_slot.weekday then
        continue;
      end if;
      if v_sub.effective_end_date is not null and v_occ_date > v_sub.effective_end_date then
        continue;
      end if;

      v_starts_at := (v_occ_date::text || ' ' || v_slot.start_time::text)::timestamp at time zone 'Asia/Jerusalem';
      v_ends_at := (v_occ_date::text || ' ' || v_slot.end_time::text)::timestamp at time zone 'Asia/Jerusalem';

      if exists (
        select 1 from bookings
        where subscription_id = p_subscription_id
          and room_id = v_slot.room_id
          and starts_at = v_starts_at
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
$$ language plpgsql security definer;

-- ═══ הפעלת ססיה בעקבות callback מאומת (§7.4) — אידמפוטנטי ═══
-- נקראת אך ורק מ-app/api/payplus/callback עם ה-admin client, אחרי אימות hash.
create or replace function activate_session_payment(
  p_payment_id uuid,
  p_transaction_uid text,
  p_method payment_method,
  p_token_uid text,
  p_card_last4 text default null,
  p_card_expiry text default null,
  p_invoice_url text default null
)
returns void as $$
declare
  v_payment payments%rowtype;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = 'paid' then
    return; -- אידמפוטנטיות
  end if;

  if v_payment.type <> 'session_initial' or v_payment.subscription_id is null then
    raise exception 'INVALID_PAYMENT_TYPE';
  end if;

  update payments
  set status = 'paid',
      method = p_method,
      payplus_transaction_uid = p_transaction_uid,
      invoice_url = coalesce(p_invoice_url, invoice_url),
      paid_at = now()
  where id = p_payment_id;

  update profiles
  set payplus_token_uid = p_token_uid,
      card_last4 = coalesce(p_card_last4, card_last4),
      card_expiry = coalesce(p_card_expiry, card_expiry)
  where id = v_payment.user_id;

  update session_subscriptions
  set status = 'active', start_date = current_date, next_billing_date = current_date + interval '1 month'
  where id = v_payment.subscription_id;

  perform materialize_subscription_bookings(v_payment.subscription_id, 90);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_payment.user_id, 'session_activated', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer;
