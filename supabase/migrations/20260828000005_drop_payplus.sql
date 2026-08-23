-- בקליניקה — שחרור מלא מ-PayPlus: כל תשלום (כרטיסייה, ססיה — ראשוני וחידוש)
-- עובר מעכשיו דרך חנות ה-Woo (baclinica.co.il), בדיוק כמו כרטיסיות היום —
-- הפניה לדף תשלום באתר, ואישור התשלום חוזר דרך app/api/woo/webhook.
--
-- הסיבה: PayPlus מעולם לא חובר בפועל (ר' OPERATIONS.md סעיף 3/8) —
-- queryPaymentStatus היה stub מפורש, וצורת ה-payload של generateLink/callback
-- לא אומתה מול תיעוד רשמי. הזרימה דרך Woo כבר בנויה, בדוקה ועובדת (כרטיסיות).
--
-- ═══ מוסיף את ה-mapping למוצר הססיה הקבוע ב-Woo (session_base_price/hours) ═══
-- ערך התחלתי 0 — האדמין ימלא את ה-Product ID האמיתי דרך /admin/settings
-- ברגע שיתקבל מהמפתח של האתר (בדיוק כמו woo_product_tiers לכרטיסיות).
insert into app_settings (key, value)
select 'woo_session_product_id', '0'::jsonb
where not exists (select 1 from app_settings where key = 'woo_session_product_id');

-- ═══ מסיר RPCs שהיו קיימים אך ורק לשרת את זרימת ה-PayPlus הישירה ═══
-- create_punch_card_purchase + activate_punch_card_payment: הוחלפו כבר
-- לגמרי ע"י claim_woo_pending_purchase (רכישת כרטיסייה דרך Woo) — אין יותר
-- נתיב שיוצר תשלום punch_card ב-status='pending'.
drop function if exists create_punch_card_purchase(uuid);
drop function if exists activate_punch_card_payment(uuid, text, payment_method, text);

-- mark_payment_failed + set_payment_page_uid: שימשו רק את callback/הסנכרון
-- התקופתי של PayPlus (app/api/payplus/callback, app/api/cron/sync-payments) —
-- שניהם הוסרו. session_initial/session_recurring ממשיכים ליצור תשלום pending
-- (create_session_initial_payment / initiate_session_renewal_payment, ללא שינוי)
-- לצורך מסלול המזומן הידני שנשאר קיים — רק ההפעלה בפועל עברה ל-webhook.
drop function if exists mark_payment_failed(uuid, text);
drop function if exists set_payment_page_uid(uuid, text);

-- ═══ initiate_session_renewal_payment: מוסיף מסלול אדמין ═══
-- לפני התיקון היה therapist-only (כמו create_session_initial_payment לפני
-- 20260824000002) — אדמין לא יכל ליצור עבור מטפל/ת תשלום חידוש כדי לסמן
-- אותו כשולם במזומן, אם המטפל/ת לא לחצ/ה "חידוש" בעצמו/ה קודם. עכשיו,
-- כשאין יותר PayPlus ואין נתיב אחר בכלל ליצור תשלום ססיה, זה חייב לעבוד
-- גם מהצד של האדמין — אותו תיקון בדיוק כמו ב-create_session_initial_payment.
create or replace function initiate_session_renewal_payment(p_subscription_id uuid)
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
  if v_sub.status not in ('active', 'pending_cancellation', 'expired') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);
  v_vat := round(v_sub.monthly_price * v_vat_rate, 2);
  v_total := v_sub.monthly_price + v_vat;

  insert into payments (user_id, type, status, amount_before_vat, vat_amount, amount_total, subscription_id)
  values (v_sub.user_id, 'session_recurring', 'pending', v_sub.monthly_price, v_vat, v_total, p_subscription_id)
  returning id into v_payment_id;

  return query select v_payment_id, v_total;
end;
$$ language plpgsql security definer set search_path = public;
