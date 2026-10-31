-- תשלומי ססיות ומחזור החיים של מנוי (בדיקה מעמיקה 31/10, קבוצה 3).
-- חובה לפני הפעלה מחדש של חיוב הססיות (app_settings.session_billing_paused).

-- ═══ A. finalize_session_renewal — overload כפול ═══
-- שתי גרסאות עם ברירות מחדל זהות לפרמטרים 3–5: כל קריאה עם עד 5 פרמטרים
-- בשם (process-order, admin/payments) נכשלה ב-PostgREST כ-"not unique"
-- (PGRST203). הגרסה הישנה (בלי p_method) גם לא הפעילה מחדש ולא יצרה מפגשים.
drop function if exists public.finalize_session_renewal(uuid, boolean, text, text, text);

-- ═══ E. סיום מנוי מבטל את המפגשים העתידיים שכבר נוצרו ═══
-- materialize יוצר מפגשים 90 יום קדימה. בקשת ביטול של המטפל/ת, "סיום טווח"
-- ע"י אדמין ופקיעה (חיוב שלא חודש) שינו רק status/effective_end_date — המפגשים
-- נשארו confirmed: החדר נראה תפוס לכולם, והמטפל/ת "מחזיק/ה" מפגשים שלא שולמו.
-- admin_note 'סוף מנוי' = מצבה שניתן ליצור מחדש (ר' materialize למטה) — אם
-- המנוי חוזר לפעול (תשלום מאוחר, הארכת טווח), המפגשים נוצרים שוב.
create or replace function cancel_session_bookings_after(p_subscription_id uuid, p_after date)
returns integer as $$
declare
  v_cancelled integer;
begin
  update bookings
  set status = 'cancelled_by_admin', cancelled_at = now(), hours_refunded = false, admin_note = 'סוף מנוי'
  where subscription_id = p_subscription_id
    and status = 'confirmed'
    and starts_at > now()
    and (starts_at at time zone 'Asia/Jerusalem')::date > p_after;
  get diagnostics v_cancelled = row_count;
  if v_cancelled > 0 then
    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(), 'session_bookings_cancelled_on_end', 'session_subscriptions', p_subscription_id,
            jsonb_build_object('after', p_after, 'cancelled_bookings', v_cancelled));
  end if;
  return v_cancelled;
end;
$$ language plpgsql security definer set search_path = public;
revoke all on function cancel_session_bookings_after(uuid, date) from public, anon, authenticated;

-- materialize: מצבה עם 'סוף מנוי' (כמו 'סוף משבצת') לא חוסמת יצירה מחדש.
create or replace function materialize_subscription_bookings(p_subscription_id uuid, p_horizon_days integer)
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
      if v_slot.valid_from is not null and v_occ_date < v_slot.valid_from then
        continue;
      end if;
      if v_slot.valid_until is not null and v_occ_date > v_slot.valid_until then
        continue;
      end if;

      v_starts_at := (v_occ_date::text || ' ' || v_slot.start_time::text)::timestamp at time zone 'Asia/Jerusalem';
      v_ends_at := (v_occ_date::text || ' ' || v_slot.end_time::text)::timestamp at time zone 'Asia/Jerusalem';

      -- שורה קיימת (גם מבוטלת) חוסמת יצירה מחדש — כך ביטול/הזזה של מפגש בודד
      -- נשארים. חריג: מפגשים שבוטלו כי המשבצת הסתיימה או כי המנוי הסתיים —
      -- אם המשבצת/המנוי חוזרים, הם נוצרים מחדש.
      if exists (
        select 1 from bookings
        where subscription_id = p_subscription_id
          and room_id = v_slot.room_id
          and starts_at = v_starts_at
          and not (status <> 'confirmed'
                   and coalesce(admin_note, '') in ('סוף משבצת (ניהול ססיות)', 'סוף מנוי'))
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

-- סיום טווח ע"י אדמין — עכשיו גם מבטל את המפגשים שאחרי היום.
create or replace function admin_end_session_term(p_subscription_id uuid)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_end date;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'expired') then
    raise exception 'FORBIDDEN';
  end if;
  v_end := least(coalesce(v_sub.effective_end_date, current_date), current_date);
  update session_subscriptions
  set status = 'cancelled', effective_end_date = v_end
  where id = p_subscription_id;
  perform cancel_session_bookings_after(p_subscription_id, v_end);
  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_term_ended_by_admin', 'session_subscriptions', p_subscription_id, '{}'::jsonb);
end;
$$ language plpgsql security definer set search_path = public;

-- הארכת/קיצור טווח — קיצור מבטל את המפגשים שמעבר לסוף החדש.
create or replace function admin_renew_session_term(p_subscription_id uuid, p_term_months integer)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_new_end date;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_term_months not in (1, 3, 6, 12) then
    raise exception 'INVALID_TERM';
  end if;
  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'expired') then
    raise exception 'FORBIDDEN';
  end if;
  v_new_end := current_date + (p_term_months || ' months')::interval;
  update session_subscriptions set effective_end_date = v_new_end where id = p_subscription_id;
  if v_sub.effective_end_date is null or v_new_end < v_sub.effective_end_date then
    perform cancel_session_bookings_after(p_subscription_id, v_new_end);
  end if;
  perform materialize_subscription_bookings(p_subscription_id, 90);
  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_term_renewed', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('term_months', p_term_months, 'effective_end_date', v_new_end));
end;
$$ language plpgsql security definer set search_path = public;

-- בקשת ביטול של המטפל/ת — מבטלת את המפגשים שאחרי תאריך הסיום, ותאריך
-- הסיום לעולם לא לפני תקופת ההודעה המוקדמת (כשמועד החיוב "נסחף" לעבר
-- בזמן השהיית חיוב, החישוב הקודם יכול היה לתת תאריך שכבר עבר).
create or replace function request_subscription_cancellation(p_subscription_id uuid)
returns table(effective_end_date date) as $$
declare
  v_sub session_subscriptions%rowtype;
  v_notice_days numeric;
  v_effective date;
begin
  select * into v_sub from session_subscriptions
  where id = p_subscription_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if v_sub.status <> 'active' then
    raise exception 'FORBIDDEN';
  end if;

  select (value#>>'{}')::numeric into v_notice_days from app_settings where key = 'sub_cancel_notice_days';
  v_notice_days := coalesce(v_notice_days, 30);

  v_effective := v_sub.next_billing_date;
  if v_effective < (current_date + (v_notice_days || ' days')::interval)::date then
    v_effective := (v_effective + interval '1 month')::date;
  end if;
  v_effective := greatest(v_effective, (current_date + (v_notice_days || ' days')::interval)::date);

  update session_subscriptions
  set status = 'pending_cancellation', cancel_requested_at = now(), effective_end_date = v_effective
  where id = p_subscription_id;

  perform cancel_session_bookings_after(p_subscription_id, v_effective);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_cancellation_requested', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('effective_end_date', v_effective));

  return query select v_effective;
end;
$$ language plpgsql security definer set search_path = public;

-- ה-cron השעתי: סגירה + ביטול מפגשים, ותשלומי פתיחה שנשארו pending של
-- בקשות שפקעו/נדחו/בוטלו מסומנים failed — אחרת תשלום מאוחר בחנות היה
-- "מחייה" מנוי ישן (ר' D).
create or replace function expire_session_holds_and_cancellations()
returns void as $$
declare
  r record;
begin
  perform assert_service_or_admin();

  update session_subscriptions
  set status = 'expired'
  where status in ('requested', 'awaiting_payment') and hold_expires_at < now();

  for r in
    select id, effective_end_date from session_subscriptions
    where status = 'pending_cancellation' and effective_end_date < current_date
    for update
  loop
    update session_subscriptions set status = 'cancelled' where id = r.id;
    perform cancel_session_bookings_after(r.id, r.effective_end_date);
  end loop;

  if coalesce((select (value#>>'{}')::numeric from app_settings where key = 'session_billing_paused'), 0) <> 1 then
    for r in
      select id from session_subscriptions
      where status = 'active' and next_billing_date < current_date
      for update
    loop
      update session_subscriptions set status = 'expired' where id = r.id;
      perform cancel_session_bookings_after(r.id, current_date - 1);
    end loop;
  end if;

  update payments p
  set status = 'failed', failure_reason = coalesce(p.failure_reason, 'SUBSCRIPTION_NOT_AWAITING_PAYMENT')
  from session_subscriptions s
  where s.id = p.subscription_id
    and p.type = 'session_initial'
    and p.status = 'pending'
    and s.status in ('expired', 'rejected', 'cancelled');
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ D. תשלום פתיחה רק למנוי שממתין לתשלום ═══
-- בלי זה, תשלום (מאוחר / תואם בטעות) הפעיל מנוי שפקע/נדחה/בוטל — ייתכן
-- שהמשבצת כבר ניתנה למטפל/ת אחר/ת. השגיאה מגיעה ל-process-order, ששולח
-- התראה להנהלה (הכסף נגבה, צריך לטפל ידנית).
create or replace function activate_session_payment(
  p_payment_id uuid, p_transaction_uid text, p_method payment_method,
  p_token_uid text default null, p_card_last4 text default null, p_card_expiry text default null,
  p_invoice_url text default null
)
returns void as $$
declare
  v_payment payments%rowtype;
  v_sub_status sub_status;
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

  select status into v_sub_status from session_subscriptions where id = v_payment.subscription_id for update;
  if v_sub_status is distinct from 'awaiting_payment' then
    raise exception 'SUBSCRIPTION_NOT_AWAITING_PAYMENT';
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
  perform cleanup_skedda_import_blocks(v_payment.subscription_id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_payment.user_id, 'session_activated', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer set search_path = public;

-- חידוש לא "מחייה" מנוי שבוטל/נדחה, ולא מבטל בקשת ביטול של המטפל/ת
-- (pending_cancellation). expired כן — תשלום מאוחר מחזיר מנוי שפקע.
create or replace function finalize_session_renewal(
  p_payment_id uuid, p_success boolean, p_transaction_uid text default null,
  p_invoice_url text default null, p_reason text default null, p_method payment_method default null
)
returns void as $$
declare
  v_payment payments%rowtype;
  v_sub session_subscriptions%rowtype;
  v_new_billing_date date;
begin
  perform assert_service_or_admin();

  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.type <> 'session_recurring' or v_payment.subscription_id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_payment.status <> 'pending' then
    return;
  end if;

  select * into v_sub from session_subscriptions where id = v_payment.subscription_id for update;

  if p_success then
    if v_sub.status in ('cancelled', 'rejected', 'pending_cancellation') then
      raise exception 'SUBSCRIPTION_NOT_RENEWABLE';
    end if;

    update payments
    set status = 'paid', method = coalesce(p_method, method), payplus_transaction_uid = p_transaction_uid,
        invoice_url = coalesce(p_invoice_url, invoice_url), paid_at = now()
    where id = p_payment_id;

    if v_sub.next_billing_date is not null and v_sub.next_billing_date >= current_date then
      v_new_billing_date := v_sub.next_billing_date + interval '1 month';
    else
      v_new_billing_date := current_date + interval '1 month';
    end if;

    update session_subscriptions
    set status = 'active', next_billing_date = v_new_billing_date, renewal_reminder_sent_at = null
    where id = v_sub.id;

    perform materialize_subscription_bookings(v_sub.id, 90);

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (v_sub.user_id, 'session_renewal_paid', 'payments', p_payment_id,
            jsonb_build_object('next_billing_date', v_new_billing_date));
  else
    update payments
    set status = 'failed', failure_reason = p_reason, retry_count = retry_count + 1
    where id = p_payment_id;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (v_sub.user_id, 'session_renewal_failed', 'payments', p_payment_id,
            jsonb_build_object('reason', p_reason));
  end if;
end;
$$ language plpgsql security definer set search_path = public;
