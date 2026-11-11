-- תשלום ססיה בחנות של מטפל/ת שכבר יש לו/ה ססיה פעילה (ואין תשלום ממתין) —
-- נרשם כחידוש חודשי במקום התראת "תשלום לא שויך" (החלטת הבעלים 11/11; הזמנות
-- 1078, 1087). אותו מסלול בדיוק כמו חידוש רגיל: שורת session_recurring
-- ממתינה → finalize_session_renewal (paid, next_billing_date + חודש,
-- materialize). אידמפוטנטי לפי p_transaction_uid.
--
-- בחירת המנוי: ססיה פעילה אחת → היא. כמה ססיות פעילות → זו שהמחיר החודשי
-- שלה (כולל מע"מ) תואם לסכום ששולם (±1 ₪); אף אחת / יותר מאחת → AMBIGUOUS
-- (ההנהלה מקבלת התראה עם שם המטפל/ת ומשייכת ידנית).
create or replace function record_woo_session_renewal(
  p_user_id uuid,
  p_amount_total numeric,
  p_transaction_uid text
)
returns table (payment_id uuid, subscription_id uuid) as $$
declare
  v_existing payments%rowtype;
  v_vat_rate numeric;
  v_sub_id uuid;
  v_count int;
  v_before numeric;
  v_payment_id uuid;
begin
  perform assert_service_or_admin();

  select * into v_existing from payments where payplus_transaction_uid = p_transaction_uid;
  if found then
    return query select v_existing.id, v_existing.subscription_id;
    return;
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);

  select count(*) into v_count from session_subscriptions
  where user_id = p_user_id and status in ('active', 'pending_cancellation');
  if v_count = 0 then
    raise exception 'NO_ACTIVE_SUBSCRIPTION';
  elsif v_count = 1 then
    select id into v_sub_id from session_subscriptions
    where user_id = p_user_id and status in ('active', 'pending_cancellation');
  else
    select count(*) into v_count from session_subscriptions
    where user_id = p_user_id and status in ('active', 'pending_cancellation')
      and abs(round(monthly_price * (1 + v_vat_rate), 2) - p_amount_total) <= 1;
    if v_count <> 1 then
      raise exception 'AMBIGUOUS_SUBSCRIPTION';
    end if;
    select id into v_sub_id from session_subscriptions
    where user_id = p_user_id and status in ('active', 'pending_cancellation')
      and abs(round(monthly_price * (1 + v_vat_rate), 2) - p_amount_total) <= 1;
  end if;

  v_before := round(p_amount_total / (1 + v_vat_rate), 2);
  insert into payments (user_id, type, status, amount_before_vat, vat_amount, amount_total, subscription_id)
  values (p_user_id, 'session_recurring', 'pending', v_before, p_amount_total - v_before, p_amount_total, v_sub_id)
  returning id into v_payment_id;

  perform finalize_session_renewal(v_payment_id, true, p_transaction_uid, null, null, 'other');

  return query select v_payment_id, v_sub_id;
end;
$$ language plpgsql security definer set search_path = public;
