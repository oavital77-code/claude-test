-- בקליניקה — רכישת כרטיסייה דרך חנות ה-WooCommerce (baclinica-shop), עוד לפני
-- שיש למטפל/ת חשבון Cleana. ר' דיון תכנון: המטפל/ת משלם/ת ב-Woo, ה-webhook
-- שומר "רכישה ממתינה" לפי טלפון/מייל, וברגע ההרשמה הרגילה ב-Cleana (לא זרימה
-- נפרדת) המערכת מפעילה אותה אוטומטית על הפרופיל החדש.
--
-- 🔴 חוק ברזל #1: גם כאן, שום כתיבה ישירה ל-punch_cards/payments מקוד
-- האפליקציה/ה-webhook — רק דרך claim_woo_pending_purchase (SECURITY DEFINER,
-- טרנזקציה יחידה, FOR UPDATE).
--
-- ⚠️ התשלום כבר בוצע בפועל בצד Woo (בגייטוויי שלה, לא ה-PAYPLUS_API_KEY של
-- Cleana — ר' ההערה ב-.env.example). ה-webhook הוא מקור האמת לכך שהוזמן
-- ושולם; אין כאן אימות hash מול PayPlus כי זה לא ה-callback של PayPlus.

alter type payment_method add value if not exists 'other';

-- ═══ מיפוי מוצר ב-Woo → מדרגת כרטיסייה ═══
create table woo_product_tiers (
  woo_product_id  bigint primary key,
  tier_id         uuid not null references punch_card_tiers(id),
  created_at      timestamptz default now()
);

-- ═══ רכישה ממתינה: התקבל תשלום ב-Woo, טרם קיים חשבון Cleana תואם ═══
create table woo_pending_purchases (
  id            uuid primary key default gen_random_uuid(),
  woo_order_id  bigint not null,
  tier_id       uuid not null references punch_card_tiers(id),
  phone         text,
  email         text,
  quantity      int not null default 1 check (quantity > 0),
  amount_total  numeric(10,2) not null, -- סה"כ ששולם ב-Woo עבור כל היחידות (quantity) יחד
  status        text not null default 'pending' check (status in ('pending', 'claimed', 'expired')),
  claimed_by    uuid references profiles(id),
  claimed_at    timestamptz,
  created_at    timestamptz default now(),
  expires_at    timestamptz not null default now() + interval '90 days',
  constraint woo_pending_purchases_has_contact check (phone is not null or email is not null),
  constraint woo_pending_purchases_order_tier_unique unique (woo_order_id, tier_id)
);
create index on woo_pending_purchases (phone) where status = 'pending';
create index on woo_pending_purchases (email) where status = 'pending';

alter table woo_product_tiers    enable row level security;
alter table woo_pending_purchases enable row level security;

-- ניהול המיפוי — אדמין בלבד. שתי הטבלאות לא נחשפות למטפל/ת כלל (אין "own"
-- לפני שיש claimed_by, וגם אחרי — הפרטים שמישהו קנה נשארים לאדמין).
create policy admin_all_woo_tiers on woo_product_tiers for all using (is_admin());
create policy admin_all_woo_pending on woo_pending_purchases for all using (is_admin());

-- ═══ הפעלת רכישות ממתינות תואמות (טלפון/מייל) על פרופיל חדש שנרשם עכשיו ═══
-- נקראת מ-completeRegistration מיד אחרי insert לפרופיל, בהקשר auth.uid() של
-- המטפל/ת עצמו/ה. תומכת בכמה רכישות ממתינות בו-זמנית (FIFO לפי created_at).
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
      and (
        (phone is not null and phone = v_profile.phone)
        or (email is not null and lower(email) = lower(v_profile.email))
      )
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
