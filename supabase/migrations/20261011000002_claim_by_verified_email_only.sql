-- בקליניקה — סגירת גניבת רכישת Woo דרך יצירת פרופיל (ממצא #1, בדיקה 11/10).
--
-- 20260828000008 נעל phone/email מפני UPDATE עצמי, אבל לא ב-INSERT: מדיניות
-- admin_insert_profile בודקת רק id = auth.uid(). משתמש שאימת מייל משלו יכול
-- היה לעקוף את טופס ההרשמה ולקרוא ישירות ל-
--   POST /rest/v1/profiles  { id: <שלו>, email: "<מייל של אחר/ת>", ... }
-- ו-claim_woo_pending_purchase (רץ בכל טעינת עמוד) הצמיד לו רכישה ששולמה ע"י
-- מי שעוד לא נרשמה. שוחזר בפרודקשן בטרנזקציה מבוטלת (claimed_count=1).
-- בנוסף, הטלפון בהרשמה לא מאומת (אין OTP) — כך שגם בטופס הרגיל, הזנת טלפון
-- של אחר/ת הספיקה כדי לקבל את הרכישה שלו/ה.
--
-- התיקון, בשתי שכבות:
-- 1. ב-INSERT עצמי, email נדרס תמיד למייל המאומת מ-auth.users.
-- 2. claim_woo_pending_purchase מתאים לפי מייל בלבד (המזהה המאומת היחיד).
--    רכישה שתואמת רק לפי טלפון נשארת pending — אדמין משייך ידנית.

create or replace function enforce_profile_privilege_columns() returns trigger as $$
begin
  if current_setting('baclinica.trusted_write', true) = 'on' then
    return new;
  end if;

  if is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.role := old.role;
    new.status := old.status;
    new.door_code := old.door_code;
    new.payplus_token_uid := old.payplus_token_uid;
    new.card_last4 := old.card_last4;
    new.card_expiry := old.card_expiry;
    new.phone := old.phone;
    new.email := old.email;
  else
    new.role := 'therapist';
    new.status := 'active';
    new.door_code := null;
    new.payplus_token_uid := null;
    new.card_last4 := null;
    new.card_expiry := null;
    -- auth.uid() null = הקשר service-role (יצירת מטפל/ת ע"י אדמין דרך
    -- ה-admin client) — שם המייל נקבע ע"י הקוד המהימן ונשאר כמו שהוא.
    if auth.uid() is not null then
      new.email := (select lower(u.email) from auth.users u where u.id = auth.uid());
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function claim_woo_pending_purchase()
returns table (claimed_count int, hours_granted numeric) as $$
declare
  v_profile profiles%rowtype;
  v_pending woo_pending_purchases%rowtype;
  v_tier punch_card_tiers%rowtype;
  v_vat_rate numeric;
  v_price numeric;
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

    v_price := v_tier.hours * v_tier.price_per_hour;
    v_deposit := v_tier.deposit_hours * v_tier.price_per_hour;
    v_before_vat := v_price + v_deposit;
    v_vat := round(v_before_vat * v_vat_rate, 2);
    -- quantity>1 (מספר כרטיסיות זהות באותה הזמנת Woo) → כרטיסייה נפרדת לכל
    -- יחידה, עם הסכום ששולם בפועל מחולק שווה בשווה בין היחידות.
    v_unit_amount := round(v_pending.amount_total / v_pending.quantity, 2);

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
