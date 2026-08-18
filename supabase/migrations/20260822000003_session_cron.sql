-- בקליניקה — cron ססיות: materialization יומי, חידוש חודשי, ניקוי holds (M5)
-- ר' baclinica-spec.md §6.6-6.7, §3.2, §3.4, CLAUDE.md טבלת Cron.
--
-- הפונקציות כאן נועדו להיקרא רק מ-service role (cron routes / webhook),
-- לעולם לא ישירות ע"י מטפל. auth.uid() הוא null בהקשר service role (אין
-- session), כך שהתנאי "auth.uid() לא null וגם לא אדמין → חסום" מגן על כך.

create or replace function assert_service_or_admin() returns void as $$
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
end;
$$ language plpgsql security definer stable;

-- ═══ יומי 03:00 — materialize_session_bookings, רולינג 90 יום (§6.6) ═══
create or replace function materialize_session_bookings()
returns void as $$
declare
  v_sub record;
begin
  perform assert_service_or_admin();

  for v_sub in
    select id from session_subscriptions where status in ('active', 'pending_cancellation')
  loop
    perform materialize_subscription_bookings(v_sub.id, 90);
  end loop;
end;
$$ language plpgsql security definer;

-- ═══ יצירת תשלום חידוש חודשי (pending) — נקרא לפני חיוב הטוקן בפועל ═══
create or replace function create_session_renewal_payment(p_subscription_id uuid)
returns table (payment_id uuid, amount_total numeric, user_id uuid) as $$
declare
  v_sub session_subscriptions%rowtype;
  v_vat_rate numeric;
  v_vat numeric;
  v_total numeric;
  v_payment_id uuid;
begin
  perform assert_service_or_admin();

  select * into v_sub from session_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);
  v_vat := round(v_sub.monthly_price * v_vat_rate, 2);
  v_total := v_sub.monthly_price + v_vat;

  insert into payments (user_id, type, status, amount_before_vat, vat_amount, amount_total, subscription_id)
  values (v_sub.user_id, 'session_recurring', 'pending', v_sub.monthly_price, v_vat, v_total, p_subscription_id)
  returning id into v_payment_id;

  return query select v_payment_id, v_total, v_sub.user_id;
end;
$$ language plpgsql security definer;

-- ═══ סגירת תוצאת חיוב חידוש: הצלחה מקדמת חיוב הבא, כישלון סופר וממתין/משעה (§6.7) ═══
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
      update profiles set status = 'suspended' where id = v_sub.user_id;
      insert into audit_log (actor_id, action, entity, entity_id, after)
      values (v_sub.user_id, 'user_suspended_renewal_failures', 'profiles', v_sub.user_id, '{}'::jsonb);
      return query select true;
    else
      return query select false;
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- ═══ בקשת ביטול מנוי ססיה — 30 יום מראש (§3.4, §8.7) ═══
-- אם נותרו פחות מ-sub_cancel_notice_days עד next_billing_date, הביטול נדחה
-- למחזור הבא (עוד חיוב אחד יתבצע); אחרת הוא נכנס לתוקף בסוף התקופה ששולמה.
create or replace function request_subscription_cancellation(p_subscription_id uuid)
returns table (effective_end_date date) as $$
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

  update session_subscriptions
  set status = 'pending_cancellation', cancel_requested_at = now(), effective_end_date = v_effective
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_cancellation_requested', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('effective_end_date', v_effective));

  return query select v_effective;
end;
$$ language plpgsql security definer;

-- ═══ כל שעה — ניקוי holds פגי תוקף + סגירת ביטולים שהגיעו לתאריך היעד ═══
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
end;
$$ language plpgsql security definer;
