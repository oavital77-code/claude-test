-- בקליניקה — מאפשר לאדמין ליצור את בקשת התשלום הראשוני של ססיה מיד עם
-- האישור (כדי לשלוח את קישור התשלום במייל, §3.3/§10), לא רק למטפל עצמו.
-- מחליף את create_session_initial_payment מ-20260822000002 (CREATE OR REPLACE
-- על אותה חתימה — לא מיגרציה הרסנית).

create or replace function create_session_initial_payment(p_subscription_id uuid)
returns table (payment_id uuid, amount_total numeric) as $$
declare
  v_sub session_subscriptions%rowtype;
  v_vat_rate numeric;
  v_vat numeric;
  v_total numeric;
  v_payment_id uuid;
begin
  select * into v_sub from session_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if v_sub.user_id <> auth.uid() and not is_admin() then
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
  values (v_sub.user_id, 'session_initial', 'pending', v_sub.monthly_price, v_vat, v_total, p_subscription_id)
  returning id into v_payment_id;

  return query select v_payment_id, v_total;
end;
$$ language plpgsql security definer;

-- אותו תיקון עבור set_payment_page_uid (מ-20260820000001) — אדמין יכול
-- לקשר page_uid לתשלום שיצר בשם המטפל.
create or replace function set_payment_page_uid(p_payment_id uuid, p_page_uid text)
returns void as $$
declare
  v_payment payments%rowtype;
begin
  select * into v_payment from payments where id = p_payment_id and status = 'pending';
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_payment.user_id <> auth.uid() and not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  update payments set payplus_page_uid = p_page_uid where id = p_payment_id;
end;
$$ language plpgsql security definer;
