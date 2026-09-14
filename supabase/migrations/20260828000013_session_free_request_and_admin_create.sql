-- שלושה שינויים בתהליך הססיה, לפי בקשת המשתמש:
--
-- 1. request_session כבר לא בודק זמינות (session_slot_conflicts) — הבקשה
--    תמיד מגיעה לאדמין, גם אם המשבצת המבוקשת תפוסה. אין יותר "מישהו אחר
--    כבר סגר את המשבצת הזו" בשלב הבקשה — זה חושף מידע על מטפל/ת אחר/ת,
--    ובכל מקרה ההחלטה שייכת לאדמין. approve_session ממשיך לבדוק זמינות
--    בפועל (לא נוגעים בו) — אם יש התנגשות אמיתית, האישור הרגיל נחסם,
--    והפתרון הוא admin_create_session (סעיף 3) שבוחר חדר/יום/שעה אחרים.
--
-- 2. request_session מקבל p_start_date אופציונלי — מתי המטפל/ת רוצה
--    שהססיה תתחיל בפועל. נשמר על session_subscriptions.start_date כבר
--    בשלב הבקשה (העמודה כבר קיימת מאז ומעולם, אבל נקבעה עד היום רק
--    בהפעלה, תמיד ל"היום"). materialize_subscription_bookings מתעלם
--    ממופעים לפני start_date, בדיוק כמו שהיא כבר מתעלמת ממופעים אחרי
--    effective_end_date בביטול. activate_session_payment /
--    admin_activate_session_cash_payment כבר לא דורסים את start_date אם
--    כבר נקבע בבקשה — הם רק מעדכנים status ו-next_billing_date, ומעגנים
--    את next_billing_date לפי start_date (לא לפי תאריך התשלום עצמו).
--
-- 3. admin_create_session — אדמין קובע ססיה חופשי לגמרי (כל חדר/יום/שעה,
--    בלי בדיקת התנגשות), ישר לסטטוס awaiting_payment (מדלג על 'requested'
--    — האדמין הוא הגורם המאשר). התשלום עצמו לא מדולג: אותו מסלול תשלום
--    בדיוק כמו ססיה רגילה (create_session_initial_payment / חנות ה-Woo),
--    לפי חוק ברזל #5 — אישור (כאן: יצירה ע"י אדמין) לפני תשלום, לעולם לא
--    ההפך. עדיין נדרש בדיוק session_base_hours שעות שבועיות — לא משנים
--    את מודל התמחור, רק את הזמינות/האישור.

-- ═══ request_session — בלי בדיקת זמינות, עם p_start_date אופציונלי ═══
create or replace function request_session(p_slots jsonb, p_start_date date default null)
returns table (subscription_id uuid, weekly_hours numeric, monthly_price numeric) as $$
declare
  v_uid uuid := auth.uid();
  v_status user_status;
  v_slot jsonb;
  v_weekly_hours numeric := 0;
  v_hold_hours numeric;
  v_base_price numeric;
  v_base_hours numeric;
  v_start_date date;
  v_sub_id uuid;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN';
  end if;

  select status into v_status from profiles where id = v_uid;
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  if p_slots is null or jsonb_array_length(p_slots) = 0 then
    raise exception 'INVALID_SLOT';
  end if;

  if p_start_date is not null and p_start_date < current_date then
    raise exception 'INVALID_START_DATE';
  end if;
  v_start_date := coalesce(p_start_date, current_date);

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if (v_slot->>'weekday')::int not between 0 and 6 then
      raise exception 'INVALID_SLOT';
    end if;
    if (v_slot->>'end_time')::time <= (v_slot->>'start_time')::time then
      raise exception 'INVALID_SLOT';
    end if;
    if extract(epoch from (v_slot->>'start_time')::time)::int % 1800 <> 0
       or extract(epoch from (v_slot->>'end_time')::time)::int % 1800 <> 0 then
      raise exception 'INVALID_SLOT';
    end if;
    if not exists (select 1 from rooms where id = (v_slot->>'room_id')::uuid and active) then
      raise exception 'ROOM_UNAVAILABLE';
    end if;

    v_weekly_hours := v_weekly_hours
      + extract(epoch from ((v_slot->>'end_time')::time - (v_slot->>'start_time')::time)) / 3600;
  end loop;

  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  v_base_hours := coalesce(v_base_hours, 5);

  if v_weekly_hours <> v_base_hours then
    raise exception 'SESSION_HOURS_FIXED';
  end if;

  select (value#>>'{}')::numeric into v_hold_hours from app_settings where key = 'session_hold_hours';
  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  v_hold_hours := coalesce(v_hold_hours, 72);
  v_base_price := coalesce(v_base_price, 600);

  insert into session_subscriptions (user_id, status, weekly_hours, monthly_price, start_date, hold_expires_at)
  values (v_uid, 'requested', v_weekly_hours, v_base_price, v_start_date, now() + (v_hold_hours || ' hours')::interval)
  returning id into v_sub_id;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    insert into session_slots (subscription_id, room_id, weekday, start_time, end_time)
    values (
      v_sub_id,
      (v_slot->>'room_id')::uuid,
      (v_slot->>'weekday')::int,
      (v_slot->>'start_time')::time,
      (v_slot->>'end_time')::time
    );
  end loop;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_uid, 'session_requested', 'session_subscriptions', v_sub_id,
          jsonb_build_object('weekly_hours', v_weekly_hours, 'monthly_price', v_base_price, 'start_date', v_start_date));

  return query select v_sub_id, v_weekly_hours, v_base_price;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ מילוי bookings — מתעלם ממופעים לפני start_date (סימטרי ל-effective_end_date) ═══
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
    return;
  end if;

  for v_slot in select * from session_slots where subscription_id = p_subscription_id loop
    v_hours := extract(epoch from (v_slot.end_time - v_slot.start_time)) / 3600;

    for v_offset in 0..(p_horizon_days - 1) loop
      v_occ_date := current_date + v_offset;
      if extract(dow from v_occ_date) <> v_slot.weekday then
        continue;
      end if;
      if v_sub.start_date is not null and v_occ_date < v_sub.start_date then
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
$$ language plpgsql security definer set search_path = public;

-- ═══ הפעלת ססיה בעקבות תשלום דרך Woo — לא דורס start_date שכבר נקבע בבקשה ═══
create or replace function activate_session_payment(
  p_payment_id uuid,
  p_transaction_uid text,
  p_method payment_method,
  p_token_uid text default null,
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

  if p_token_uid is not null then
    perform set_config('baclinica.trusted_write', 'on', true);
    update profiles
    set payplus_token_uid = p_token_uid,
        card_last4 = coalesce(p_card_last4, card_last4),
        card_expiry = coalesce(p_card_expiry, card_expiry)
    where id = v_payment.user_id;
    perform set_config('baclinica.trusted_write', 'off', true);
  end if;

  update session_subscriptions
  set status = 'active',
      start_date = coalesce(start_date, current_date),
      next_billing_date = coalesce(start_date, current_date) + interval '1 month'
  where id = v_payment.subscription_id;

  perform materialize_subscription_bookings(v_payment.subscription_id, 90);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_payment.user_id, 'session_activated', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ הפעלת ססיה בתשלום מזומן — אותו תיקון ל-start_date ═══
create or replace function admin_activate_session_cash_payment(
  p_payment_id uuid,
  p_method payment_method,
  p_transaction_uid text
) returns void as $$
declare
  v_payment payments%rowtype;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

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
      paid_at = now()
  where id = p_payment_id;

  update session_subscriptions
  set status = 'active',
      start_date = coalesce(start_date, current_date),
      next_billing_date = coalesce(start_date, current_date) + interval '1 month'
  where id = v_payment.subscription_id;

  perform materialize_subscription_bookings(v_payment.subscription_id, 90);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_activated_manually', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('payment_id', p_payment_id, 'method', p_method, 'transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ אדמין קובע ססיה חופשית — בלי בדיקת התנגשות, ישר ל-awaiting_payment ═══
create or replace function admin_create_session(p_user_id uuid, p_slots jsonb, p_start_date date default null)
returns table (subscription_id uuid, weekly_hours numeric, monthly_price numeric) as $$
declare
  v_status user_status;
  v_slot jsonb;
  v_weekly_hours numeric := 0;
  v_hold_hours numeric;
  v_base_price numeric;
  v_base_hours numeric;
  v_start_date date;
  v_sub_id uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select status into v_status from profiles where id = p_user_id;
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  if p_slots is null or jsonb_array_length(p_slots) = 0 then
    raise exception 'INVALID_SLOT';
  end if;

  if p_start_date is not null and p_start_date < current_date then
    raise exception 'INVALID_START_DATE';
  end if;
  v_start_date := coalesce(p_start_date, current_date);

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if (v_slot->>'weekday')::int not between 0 and 6 then
      raise exception 'INVALID_SLOT';
    end if;
    if (v_slot->>'end_time')::time <= (v_slot->>'start_time')::time then
      raise exception 'INVALID_SLOT';
    end if;
    if extract(epoch from (v_slot->>'start_time')::time)::int % 1800 <> 0
       or extract(epoch from (v_slot->>'end_time')::time)::int % 1800 <> 0 then
      raise exception 'INVALID_SLOT';
    end if;
    if not exists (select 1 from rooms where id = (v_slot->>'room_id')::uuid and active) then
      raise exception 'ROOM_UNAVAILABLE';
    end if;

    v_weekly_hours := v_weekly_hours
      + extract(epoch from ((v_slot->>'end_time')::time - (v_slot->>'start_time')::time)) / 3600;
  end loop;

  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  v_base_hours := coalesce(v_base_hours, 5);

  if v_weekly_hours <> v_base_hours then
    raise exception 'SESSION_HOURS_FIXED';
  end if;

  select (value#>>'{}')::numeric into v_hold_hours from app_settings where key = 'session_hold_hours';
  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  v_hold_hours := coalesce(v_hold_hours, 72);
  v_base_price := coalesce(v_base_price, 600);

  insert into session_subscriptions (
    user_id, status, weekly_hours, monthly_price, start_date, hold_expires_at, reviewed_by, reviewed_at
  )
  values (
    p_user_id, 'awaiting_payment', v_weekly_hours, v_base_price, v_start_date,
    now() + (v_hold_hours || ' hours')::interval, auth.uid(), now()
  )
  returning id into v_sub_id;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    insert into session_slots (subscription_id, room_id, weekday, start_time, end_time)
    values (
      v_sub_id,
      (v_slot->>'room_id')::uuid,
      (v_slot->>'weekday')::int,
      (v_slot->>'start_time')::time,
      (v_slot->>'end_time')::time
    );
  end loop;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_created_by_admin', 'session_subscriptions', v_sub_id,
          jsonb_build_object('user_id', p_user_id, 'weekly_hours', v_weekly_hours, 'start_date', v_start_date));

  return query select v_sub_id, v_weekly_hours, v_base_price;
end;
$$ language plpgsql security definer set search_path = public;
