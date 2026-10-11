-- בקליניקה — שיוך ידני של רכישת Woo ממתינה למטפל/ת ע"י אדמין.
--
-- מאז 20261011000002 רכישה ממתינה נמשכת אוטומטית רק לפי מייל מאומת. מי
-- שקנתה בחנות במייל אחר מזה שנרשמה איתו (בייצוא Skedda מ-11/10 נמצאו 4
-- כאלה, כולל שגיאת הקלדה) — הרכישה נשארת pending, ועד עכשיו לא היה כלי
-- לשייך אותה. "שעות בונוס" לא מתאים: הרכישה נשארת פתוחה (ואפשר לזכות
-- עליה שוב), ונרשם payment של ₪0 במקום הסכום ששולם.
--
-- מבנה: הלוגיקה של יצירת הכרטיסייה/ות + payment + audit עוברת לפונקציה
-- פנימית אחת (grant_woo_pending_purchase), שמשמשת גם את claim האוטומטי וגם
-- את השיוך הידני — אותו חישוב בדיוק, בלי כפילות. הפונקציה הפנימית לא
-- חשופה ל-API (revoke מ-anon/authenticated): היא לא בודקת הרשאות בעצמה.

create or replace function grant_woo_pending_purchase(
  p_pending_id uuid,
  p_user_id uuid,
  p_audit_action text
) returns table (cards_created int, hours_granted numeric) as $$
declare
  v_pending woo_pending_purchases%rowtype;
  v_tier punch_card_tiers%rowtype;
  v_vat_rate numeric;
  v_deposit numeric;
  v_before_vat numeric;
  v_vat numeric;
  v_unit_amount numeric;
  v_card_id uuid;
  v_payment_id uuid;
  v_count int := 0;
  v_hours numeric := 0;
  v_i int;
begin
  select * into v_pending from woo_pending_purchases
  where id = p_pending_id and status = 'pending'
  for update;
  if not found then
    return query select 0, 0::numeric;
    return;
  end if;

  select * into v_tier from punch_card_tiers where id = v_pending.tier_id;
  if not found then
    -- מדרגה נמחקה בינתיים — לא סוגר את הרכישה, נשארת לטיפול ידני
    return query select 0, 0::numeric;
    return;
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);

  v_deposit := v_tier.deposit_hours * v_tier.price_per_hour;
  -- quantity>1 (מספר כרטיסיות זהות באותה הזמנת Woo) → כרטיסייה נפרדת לכל
  -- יחידה, עם הסכום ששולם בפועל מחולק שווה בשווה בין היחידות.
  v_unit_amount := round(v_pending.amount_total / v_pending.quantity, 2);
  -- הפירוק לפני מע"מ / מע"מ נגזר מהסכום ששולם בפועל (כולל מע"מ), לא
  -- ממחיר המדרגה (ר' 20261011000003).
  v_before_vat := round(v_unit_amount / (1 + v_vat_rate), 2);
  v_vat := v_unit_amount - v_before_vat;

  for v_i in 1..v_pending.quantity loop
    insert into punch_cards (
      user_id, tier_id, hours_purchased, hours_remaining,
      price_per_hour, deposit_amount, deposit_remaining, expires_at, active
    ) values (
      p_user_id, v_tier.id, v_tier.hours, v_tier.hours,
      v_tier.price_per_hour, v_deposit, v_deposit, now() + interval '24 months', true
    ) returning id into v_card_id;

    insert into payments (
      user_id, type, status, method, amount_before_vat, vat_amount, amount_total,
      punch_card_id, payplus_transaction_uid, paid_at
    ) values (
      p_user_id, 'punch_card', 'paid', 'other', v_before_vat, v_vat, v_unit_amount,
      v_card_id, 'woo-' || v_pending.id || '-' || v_i, now()
    ) returning id into v_payment_id;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(), p_audit_action, 'punch_cards', v_card_id,
            jsonb_build_object('woo_order_id', v_pending.woo_order_id, 'payment_id', v_payment_id,
                               'user_id', p_user_id));

    v_count := v_count + 1;
    v_hours := v_hours + v_tier.hours;
  end loop;

  update woo_pending_purchases
  set status = 'claimed', claimed_by = p_user_id, claimed_at = now()
  where id = v_pending.id;

  return query select v_count, v_hours;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function grant_woo_pending_purchase(uuid, uuid, text) from public, anon, authenticated;

-- claim אוטומטי (ע"י המטפל/ת עצמו/ה) — אותה התנהגות כמו 20261011000003:
-- מייל מאומת בלבד, רק רכישות בתוקף.
create or replace function claim_woo_pending_purchase()
returns table (claimed_count int, hours_granted numeric) as $$
declare
  v_profile profiles%rowtype;
  v_pending_id uuid;
  v_r record;
  v_count int := 0;
  v_hours numeric := 0;
begin
  select * into v_profile from profiles where id = auth.uid();
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  for v_pending_id in
    select id from woo_pending_purchases
    where status = 'pending'
      and expires_at > now()
      -- מייל בלבד: הטלפון בפרופיל לא מאומת, ולכן לא יכול לשמש להעברת כסף.
      and email is not null
      and lower(email) = lower(v_profile.email)
    order by created_at asc
  loop
    select * into v_r from grant_woo_pending_purchase(v_pending_id, v_profile.id, 'woo_purchase_claimed');
    v_count := v_count + v_r.cards_created;
    v_hours := v_hours + v_r.hours_granted;
  end loop;

  return query select v_count, v_hours;
end;
$$ language plpgsql security definer set search_path = public;

-- שיוך ידני ע"י אדמין — גם לרכישה שפג תוקפה (שיקול דעת של אדמין).
create or replace function admin_assign_woo_pending_purchase(p_pending_id uuid, p_user_id uuid)
returns table (cards_created int, hours_granted numeric) as $$
declare
  v_r record;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_r from grant_woo_pending_purchase(p_pending_id, p_user_id, 'woo_purchase_assigned_by_admin');
  if v_r.cards_created = 0 then
    raise exception 'PENDING_PURCHASE_NOT_AVAILABLE';
  end if;

  return query select v_r.cards_created, v_r.hours_granted;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function admin_assign_woo_pending_purchase(uuid, uuid) from public, anon;
grant execute on function admin_assign_woo_pending_purchase(uuid, uuid) to authenticated;
