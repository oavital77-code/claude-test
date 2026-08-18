-- בקליניקה — רכישת כרטיסייה + מחזור חיים של תשלום PayPlus (M3)
-- ר' baclinica-spec.md §3.1, §6.1, §7. כל הכתיבה ל-punch_cards/payments עוברת
-- דרך פונקציות SECURITY DEFINER בתוך טרנזקציה — ר' CLAUDE.md חוק ברזל #1.
--
-- הכרטיסייה נוצרת עם active=false בזמן יצירת בקשת התשלום (כדי לנעול את
-- תעריף/פיקדון המדרגה באותו רגע), ומופעלת (active=true) רק ב-callback
-- המאומת מ-PayPlus. כך אין שעות זמינות לפני תשלום בפועל (§1.2).

-- ═══ יצירת בקשת רכישה: כרטיסייה (inactive) + תשלום (pending) ═══
create or replace function create_punch_card_purchase(p_tier_id uuid)
returns table (payment_id uuid, punch_card_id uuid, amount_total numeric) as $$
declare
  v_tier punch_card_tiers%rowtype;
  v_vat_rate numeric;
  v_price numeric;
  v_deposit numeric;
  v_before_vat numeric;
  v_vat numeric;
  v_total numeric;
  v_card_id uuid;
  v_payment_id uuid;
  v_status user_status;
begin
  select status into v_status from profiles where id = auth.uid();
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  select * into v_tier from punch_card_tiers where id = p_tier_id and active;
  if not found then
    raise exception 'INVALID_TIER';
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);

  v_price := v_tier.hours * v_tier.price_per_hour;
  v_deposit := v_tier.deposit_hours * v_tier.price_per_hour;
  v_before_vat := v_price + v_deposit;
  v_vat := round(v_before_vat * v_vat_rate, 2);
  v_total := v_before_vat + v_vat;

  insert into punch_cards (
    user_id, tier_id, hours_purchased, hours_remaining,
    price_per_hour, deposit_amount, deposit_remaining, expires_at, active
  ) values (
    auth.uid(), v_tier.id, v_tier.hours, v_tier.hours,
    v_tier.price_per_hour, v_deposit, v_deposit, now() + interval '24 months', false
  ) returning id into v_card_id;

  insert into payments (
    user_id, type, status, amount_before_vat, vat_amount, amount_total, punch_card_id
  ) values (
    auth.uid(), 'punch_card', 'pending', v_before_vat, v_vat, v_total, v_card_id
  ) returning id into v_payment_id;

  return query select v_payment_id, v_card_id, v_total;
end;
$$ language plpgsql security definer;

-- ═══ קישור דף התשלום שהתקבל מ-PayPlus generateLink לתשלום הממתין ═══
create or replace function set_payment_page_uid(p_payment_id uuid, p_page_uid text)
returns void as $$
begin
  update payments
  set payplus_page_uid = p_page_uid
  where id = p_payment_id and user_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
end;
$$ language plpgsql security definer;

-- ═══ הפעלת הכרטיסייה בעקבות callback מאומת (§7.4) — אידמפוטנטי ═══
-- נקראת אך ורק מ-app/api/payplus/callback עם ה-admin client, אחרי אימות hash.
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

-- ═══ סימון תשלום שנכשל — הכרטיסייה נשארת inactive ═══
create or replace function mark_payment_failed(p_payment_id uuid, p_reason text)
returns void as $$
declare
  v_payment payments%rowtype;
begin
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
