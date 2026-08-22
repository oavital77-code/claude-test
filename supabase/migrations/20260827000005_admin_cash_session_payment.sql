-- אדמין: אישור תשלום ראשוני של ססיה שמשולם במזומן (לא דרך PayPlus) —
-- ר' §3.2/§7.2: תשלום ססיה רגיל שומר טוקן כרטיס לחיוב אוטומטי של החידוש
-- החודשי הבא; תשלום מזומן, מטבעו, אין לו טוקן. admin_mark_paid_action
-- הקיים חוסם session_initial בכוונה בגלל זה — כאן פותחים נתיב מפורש
-- למזומן, בלי לגעת בנתיב הכרטיס הרגיל. profiles.payplus_token_uid נשאר
-- ריק, כך שבכל חידוש חודשי עתידי charge-renewals ייכשל אוטומטית ("אין
-- כרטיס שמור") — האדמין יצטרך לסמן כל חידוש כשולם ידנית, בדיוק כמו כאן.

alter type payment_method add value if not exists 'cash';

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
  set status = 'active', start_date = current_date, next_billing_date = current_date + interval '1 month'
  where id = v_payment.subscription_id;

  perform materialize_subscription_bookings(v_payment.subscription_id, 90);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_activated_manually', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('payment_id', p_payment_id, 'method', p_method, 'transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ חידוש חודשי במזומן ═══
-- מנוי שהופעל במזומן (בלי טוקן כרטיס) גורם ל-charge-renewals cron להיכשל
-- אוטומטית בכל חידוש ("אין כרטיס שמור") — התשלום מגיע ל-status='failed',
-- לא 'pending'. finalize_session_renewal מסרב לגעת בתשלום שכבר לא pending
-- (אידמפוטנטיות מכוונת של הנתיב האוטומטי) — כאן נתיב אדמין נפרד שמטפל
-- גם ב-failed, ומקדם את next_billing_date בהתאם.
create or replace function admin_mark_session_recurring_paid_cash(
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

  if v_payment.type <> 'session_recurring' or v_payment.subscription_id is null then
    raise exception 'INVALID_PAYMENT_TYPE';
  end if;

  update payments
  set status = 'paid', method = p_method, payplus_transaction_uid = p_transaction_uid, paid_at = now()
  where id = p_payment_id;

  update session_subscriptions
  set next_billing_date = next_billing_date + interval '1 month'
  where id = v_payment.subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_renewal_paid_manually', 'payments', p_payment_id,
          jsonb_build_object('transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer set search_path = public;
