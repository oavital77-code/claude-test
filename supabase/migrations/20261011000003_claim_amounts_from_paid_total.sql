-- בקליניקה — סכומי payment נכונים ברכישת Woo שנמשכה (ממצא #3, בדיקה 11/10).
--
-- claim_woo_pending_purchase חישב amount_before_vat/vat_amount ממחיר המדרגה,
-- אבל amount_total מהסכום ששולם בפועל ב-Woo. עם קופון/הנחה (למשל 10 שעות
-- ב-₪100 במקום ₪649) נרשם before_vat=550, vat=99, total=100 — לא מסתכם.
-- מעכשיו שני השדות נגזרים מהסכום ששולם בפועל. גוף הפונקציה זהה ל-
-- 20261011000002 (התאמה לפי מייל בלבד) מלבד החישוב הזה.
--
-- שורות payments קיימות לא מתוקנות כאן בכוונה — תיקון היסטורי של נתונים
-- כספיים רק בהחלטה מפורשת.

create or replace function claim_woo_pending_purchase()
returns table (claimed_count int, hours_granted numeric) as $$
declare
  v_profile profiles%rowtype;
  v_pending woo_pending_purchases%rowtype;
  v_tier punch_card_tiers%rowtype;
  v_vat_rate numeric;
  v_deposit numeric;
  v_before_vat numeric;
  v_vat numeric;
  v_card_id uuid;
  v_payment_id uuid;
  v_count int := 0;
  v_hours numeric := 0;
  v_unit_amount numeric;
  v_i int;
begin
  select * into v_profile from profiles where id = auth.uid();
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);

  for v_pending in
    select * from woo_pending_purchases
    where status = 'pending'
      and expires_at > now()
      -- מייל בלבד: הטלפון בפרופיל לא מאומת, ולכן לא יכול לשמש להעברת כסף.
      and email is not null
      and lower(email) = lower(v_profile.email)
    order by created_at asc
    for update
  loop
    select * into v_tier from punch_card_tiers where id = v_pending.tier_id;
    if not found then
      continue; -- מדרגה נמחקה בינתיים — לא סוגר את הרכישה, נשארת ל-admin לטפל ידנית
    end if;

    v_deposit := v_tier.deposit_hours * v_tier.price_per_hour;
    -- quantity>1 (מספר כרטיסיות זהות באותה הזמנת Woo) → כרטיסייה נפרדת לכל
    -- יחידה, עם הסכום ששולם בפועל מחולק שווה בשווה בין היחידות.
    v_unit_amount := round(v_pending.amount_total / v_pending.quantity, 2);
    -- הפירוק לפני מע"מ / מע"מ נגזר מהסכום ששולם בפועל (כולל מע"מ, ר'
    -- lineItemAmount), לא ממחיר המדרגה — אחרת עם קופון/הנחה שלושת השדות
    -- לא מסתכמים זה לזה ודוחות ההכנסות שגויים.
    v_before_vat := round(v_unit_amount / (1 + v_vat_rate), 2);
    v_vat := v_unit_amount - v_before_vat;

    for v_i in 1..v_pending.quantity loop
      insert into punch_cards (
        user_id, tier_id, hours_purchased, hours_remaining,
        price_per_hour, deposit_amount, deposit_remaining, expires_at, active
      ) values (
        v_profile.id, v_tier.id, v_tier.hours, v_tier.hours,
        v_tier.price_per_hour, v_deposit, v_deposit, now() + interval '24 months', true
      ) returning id into v_card_id;

      insert into payments (
        user_id, type, status, method, amount_before_vat, vat_amount, amount_total,
        punch_card_id, payplus_transaction_uid, paid_at
      ) values (
        v_profile.id, 'punch_card', 'paid', 'other', v_before_vat, v_vat, v_unit_amount,
        v_card_id, 'woo-' || v_pending.id || '-' || v_i, now()
      ) returning id into v_payment_id;

      insert into audit_log (actor_id, action, entity, entity_id, after)
      values (v_profile.id, 'woo_purchase_claimed', 'punch_cards', v_card_id,
              jsonb_build_object('woo_order_id', v_pending.woo_order_id, 'payment_id', v_payment_id));

      v_count := v_count + 1;
      v_hours := v_hours + v_tier.hours;
    end loop;

    update woo_pending_purchases
    set status = 'claimed', claimed_by = v_profile.id, claimed_at = now()
    where id = v_pending.id;
  end loop;

  return query select v_count, v_hours;
end;
$$ language plpgsql security definer set search_path = public;
