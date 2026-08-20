-- בקליניקה — סגירת חור אבטחה: אימות הרשאה חסר בפונקציות הפעלה/כישלון
--
-- 🔴 ממצא ביקורת קוד: activate_punch_card_payment, activate_session_payment,
-- materialize_subscription_bookings, ו-mark_payment_failed הן SECURITY
-- DEFINER בלי שום בדיקת מבצע-קריאה — ההערה בקוד ("נקראת אך ורק מ-webhook")
-- היא כוונה, לא אכיפה. EXECUTE מוענק כברירת מחדל ל-PUBLIC, כך שכל מטפל
-- מחובר יכול לקרוא supabase.rpc('activate_punch_card_payment', {...}) על
-- payment pending שהוא עצמו יצר ולקבל כרטיסייה מלאה בלי לשלם — עקיפה
-- מוחלטת של חוק ברזל #6 (מקור האמת הוא ה-callback המאומת).
--
-- כל הפונקציות האלה הופכות ל-assert_service_or_admin(): קריאה תקינה מגיעה
-- או מה-webhook (admin client, auth.uid() null) או מאדמין (למשל "סימון
-- כשולם" ידני). מטפל רגיל לעולם לא.

create or replace function activate_punch_card_payment(
  p_payment_id uuid,
  p_transaction_uid text,
  p_method payment_method,
  p_invoice_url text default null
)
returns void as $$
declare
  v_payment payments%rowtype;
begin
  perform assert_service_or_admin();

  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = 'paid' then
    return; -- אידמפוטנטיות: callback כפול על תשלום שכבר טופל
  end if;

  if v_payment.type <> 'punch_card' or v_payment.punch_card_id is null then
    raise exception 'INVALID_PAYMENT_TYPE';
  end if;

  update payments
  set status = 'paid',
      method = p_method,
      payplus_transaction_uid = p_transaction_uid,
      invoice_url = coalesce(p_invoice_url, invoice_url),
      paid_at = now()
  where id = p_payment_id;

  update punch_cards set active = true where id = v_payment.punch_card_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_payment.user_id, 'payment_paid', 'payments', p_payment_id,
          jsonb_build_object('punch_card_id', v_payment.punch_card_id, 'transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer;

create or replace function mark_payment_failed(p_payment_id uuid, p_reason text)
returns void as $$
declare
  v_payment payments%rowtype;
begin
  perform assert_service_or_admin();

  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status in ('paid', 'failed') then
    return;
  end if;

  update payments
  set status = 'failed', failure_reason = p_reason, retry_count = retry_count + 1
  where id = p_payment_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_payment.user_id, 'payment_failed', 'payments', p_payment_id,
          jsonb_build_object('reason', p_reason));
end;
$$ language plpgsql security definer;

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
  perform assert_service_or_admin();

  select * into v_sub from session_subscriptions where id = p_subscription_id;
  if not found then
    return;
  end if;
  if v_sub.status not in ('active', 'pending_cancellation') then
    return; -- לעולם לא לשבץ הזמנות אמיתיות למנוי שלא אושר/שולם
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
  perform assert_service_or_admin();

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

  -- כתיבת טוקן הכרטיס ל-profiles חוסה מ-profiles_privilege_guard (§20260825000001) —
  -- דגל מקומי-לטרנזקציה, לא נגיש מ-PostgREST.
  perform set_config('baclinica.trusted_write', 'on', true);
  update profiles
  set payplus_token_uid = p_token_uid,
      card_last4 = coalesce(p_card_last4, card_last4),
      card_expiry = coalesce(p_card_expiry, card_expiry)
  where id = v_payment.user_id;
  perform set_config('baclinica.trusted_write', 'off', true);

  update session_subscriptions
  set status = 'active', start_date = current_date, next_billing_date = current_date + interval '1 month'
  where id = v_payment.subscription_id;

  perform materialize_subscription_bookings(v_payment.subscription_id, 90);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_payment.user_id, 'session_activated', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer;

create or replace function finalize_session_renewal(
  p_payment_id uuid,
  p_success boolean,
  p_transaction_uid text default null,
  p_invoice_url text default null,
  p_reason text default null
)
returns table (suspended boolean) as $$
declare
  v_payment payments%rowtype;
  v_sub session_subscriptions%rowtype;
  v_failure_count int;
begin
  perform assert_service_or_admin();

  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.type <> 'session_recurring' or v_payment.subscription_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_payment.status <> 'pending' then
    return query select false; -- אידמפוטנטיות
    return;
  end if;

  select * into v_sub from session_subscriptions where id = v_payment.subscription_id for update;

  if p_success then
    update payments
    set status = 'paid', payplus_transaction_uid = p_transaction_uid,
        invoice_url = coalesce(p_invoice_url, invoice_url), paid_at = now()
    where id = p_payment_id;

    update session_subscriptions
    set next_billing_date = next_billing_date + interval '1 month'
    where id = v_sub.id;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (v_sub.user_id, 'session_renewal_paid', 'payments', p_payment_id, '{}'::jsonb);

    return query select false;
  else
    update payments
    set status = 'failed', failure_reason = p_reason, retry_count = retry_count + 1
    where id = p_payment_id;

    select count(*) into v_failure_count
    from payments
    where subscription_id = v_sub.id
      and type = 'session_recurring'
      and status = 'failed'
      and created_at >= v_sub.next_billing_date::timestamptz;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (v_sub.user_id, 'session_renewal_failed', 'payments', p_payment_id,
            jsonb_build_object('reason', p_reason, 'failure_count', v_failure_count));

    if v_failure_count >= 3 then
      perform set_config('baclinica.trusted_write', 'on', true);
      update profiles set status = 'suspended' where id = v_sub.user_id;
      perform set_config('baclinica.trusted_write', 'off', true);

      insert into audit_log (actor_id, action, entity, entity_id, after)
      values (v_sub.user_id, 'user_suspended_renewal_failures', 'profiles', v_sub.user_id, '{}'::jsonb);
      return query select true;
    else
      return query select false;
    end if;
  end if;
end;
$$ language plpgsql security definer;

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

    perform set_config('baclinica.trusted_write', 'on', true);
    update profiles set status = 'suspended' where id = v_payment.user_id;
    perform set_config('baclinica.trusted_write', 'off', true);

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (v_payment.user_id, 'overrun_charge_failed_suspended', 'payments', p_payment_id,
            jsonb_build_object('reason', p_reason));
  end if;
end;
$$ language plpgsql security definer;
