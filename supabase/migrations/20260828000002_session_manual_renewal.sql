-- בקליניקה — ביטול חיוב אוטומטי בטוקן לחידוש ססיה, מעבר לחידוש יזום
-- (המטפל/ת לוחצ/ת "חידוש", מקבל/ת קישור תשלום PayPlus טרי — בדיוק כמו
-- התשלום הראשוני) + תזכורת 7 ימים מראש + פקיעת מנוי שלא חודש בזמן.
--
-- הסיבה: אין endpoint מאומת לחיוב טוקן מול PayPlus (chargeByToken היה stub
-- מפורש שתמיד נכשל — ר' lib/payplus/client.ts), וגם מבחינה עסקית לא רוצים
-- חיוב "בשקט" בלי מעורבות של המטפל/ת. מעכשיו כל תשלום ססיה — ראשוני או
-- חידוש — עובר דרך generateLink רגיל (כמו קודם), בלי create_token.

alter table session_subscriptions add column renewal_reminder_sent_at timestamptz;

-- ═══ יצירת תשלום חידוש — יזום ע"י המטפל/ת עצמו/ה (לא cron) ═══
-- מחליף את create_session_renewal_payment (שנקרא רק מ-cron/service). ניתן
-- לחדש מנוי 'active'/'pending_cancellation' (חידוש מוקדם) או 'expired'
-- (חידוש מאוחר, אחרי שהמנוי כבר פג ותאריך היעד עבר).
create or replace function initiate_session_renewal_payment(p_subscription_id uuid)
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
  if v_sub.status not in ('active', 'pending_cancellation', 'expired') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);
  v_vat := round(v_sub.monthly_price * v_vat_rate, 2);
  v_total := v_sub.monthly_price + v_vat;

  insert into payments (user_id, type, status, amount_before_vat, vat_amount, amount_total, subscription_id)
  values (auth.uid(), 'session_recurring', 'pending', v_sub.monthly_price, v_vat, v_total, p_subscription_id)
  returning id into v_payment_id;

  return query select v_payment_id, v_total;
end;
$$ language plpgsql security definer set search_path = public;

drop function if exists create_session_renewal_payment(uuid);

-- ═══ סגירת תוצאת תשלום חידוש (נקראת מה-callback, לא מ-cron יותר) ═══
-- בלי "3 כישלונות -> השעיה": זה כבר לא חיוב שקט ברקע, אלא ניסיון תשלום
-- יזום שהמטפל/ת רואה בעצמו/ה ויכול/ה לנסות שוב.
create or replace function finalize_session_renewal(
  p_payment_id uuid,
  p_success boolean,
  p_transaction_uid text default null,
  p_invoice_url text default null,
  p_reason text default null,
  p_method payment_method default null
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
    return; -- אידמפוטנטיות
  end if;

  select * into v_sub from session_subscriptions where id = v_payment.subscription_id for update;

  if p_success then
    update payments
    set status = 'paid', method = coalesce(p_method, method), payplus_transaction_uid = p_transaction_uid,
        invoice_url = coalesce(p_invoice_url, invoice_url), paid_at = now()
    where id = p_payment_id;

    -- חידוש מוקדם (עוד לא פג) ממשיך מהתאריך הקיים; חידוש מאוחר (פג/עבר
    -- התאריך) מתחיל חודש חדש מהיום.
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

-- ═══ activate_session_payment — כבר לא דורש טוקן (אין יותר חיוב אוטומטי) ═══
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
  set status = 'active', start_date = current_date, next_billing_date = current_date + interval '1 month'
  where id = v_payment.subscription_id;

  perform materialize_subscription_bookings(v_payment.subscription_id, 90);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_payment.user_id, 'session_activated', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ שעתי — כעת גם: מנוי 'active' שלא חודש עד תאריך היעד -> 'expired' ═══
-- ברגע שה-status הופך ל-expired, materialize_session_bookings (שרץ רק על
-- active/pending_cancellation) מפסיק לבד ליצור הזמנות חדשות למנוי הזה.
create or replace function expire_session_holds_and_cancellations()
returns void as $$
begin
  perform assert_service_or_admin();

  update session_subscriptions
  set status = 'expired'
  where status in ('requested', 'awaiting_payment') and hold_expires_at < now();

  update session_subscriptions
  set status = 'cancelled'
  where status = 'pending_cancellation' and effective_end_date < current_date;

  update session_subscriptions
  set status = 'expired'
  where status = 'active' and next_billing_date < current_date;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ תיקון: admin_mark_session_recurring_paid_cash חייב להתאים למצב
-- 'expired' החדש (מנוי שלא חודש בזמן) — בדיוק כמו finalize_session_renewal ═══
create or replace function admin_mark_session_recurring_paid_cash(
  p_payment_id uuid,
  p_method payment_method,
  p_transaction_uid text
) returns void as $$
declare
  v_payment payments%rowtype;
  v_sub session_subscriptions%rowtype;
  v_new_billing_date date;
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

  if v_payment.type <> 'session_recurring' or v_payment.subscription_id is null then
    raise exception 'INVALID_PAYMENT_TYPE';
  end if;

  select * into v_sub from session_subscriptions where id = v_payment.subscription_id for update;

  update payments
  set status = 'paid', method = p_method, payplus_transaction_uid = p_transaction_uid, paid_at = now()
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
  values (auth.uid(), 'session_renewal_paid_manually', 'payments', p_payment_id,
          jsonb_build_object('transaction_uid', p_transaction_uid, 'next_billing_date', v_new_billing_date));
end;
$$ language plpgsql security definer set search_path = public;
