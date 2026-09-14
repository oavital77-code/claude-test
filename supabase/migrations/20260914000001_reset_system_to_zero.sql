-- ⚠️ פונקציה הרסנית ובלתי הפיכה: מחזירה את המערכת ל"מצב אפס" — כאילו
-- נכנסו אליה בפעם הראשונה. מיועדת אך ורק לניקוי לפני כניסת משתמשים
-- אמיתיים, ולכן ננעלת אוטומטית ברגע שמישהו שאינו אדמין שילם בפועל.
--
-- מה נמחק: כל המטפלים (כולל חשבונות ה-Auth שלהם), כל ההזמנות, הכרטיסיות,
-- מנויי הססיה, התשלומים, החריגות, רשימות ההמתנה, החסימות, החדרים והסניפים.
--
-- מה שורד:
--   • חשבונות אדמין (role='admin') — כולל זה שמריץ, אחרת נועלים את עצמנו בחוץ.
--   • audit_log — כל השורות נשמרות; ה-actor_id של מטפלים שנמחקו מתאפס
--     ל-null (ה-FK הוא בלי cascade, אז בלי זה כל המחיקה הייתה נכשלת).
--   • תצורת אינטגרציה: מיפוי מוצרי Woo (woo_product_tiers) ו-
--     woo_session_product_id. אלה הגדרות חנות, לא נתוני משתמשים — ולכן
--     גם מדרגות המחיר משוחזרות ב-upsert לפי hours (ה-id נשמר) ולא
--     נמחקות ונוצרות מחדש, אחרת המיפוי היה נשבר.
--
-- שאר ההגדרות והתמחור חוזרים לערכי ברירת המחדל המקוריים (ר' seed),
-- למעט הפיקדון שנשאר מנוטרל (deposit_hours=0, ר' 20260828000009).

create or replace function reset_system_to_zero(p_confirmation text)
returns jsonb as $$
declare
  v_therapists int;
  v_bookings   int;
  v_rooms      int;
  v_branches   int;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  -- אישור מפורש בהקלדה. לא ברירת מחדל, לא כפתור בודד.
  if p_confirmation is distinct from 'מחק הכל' then
    raise exception 'INVALID_CONFIRMATION';
  end if;

  -- ═══ נעילה אחרי השקה ═══
  -- ברגע שמשתמש שאינו אדמין שילם בפועל — המערכת חיה, והאיפוס ננעל לתמיד.
  -- תשלום של אדמין (חזרה גנרלית לפני השקה) בכוונה אינו נועל.
  if exists (
    select 1
    from payments p
    join profiles pr on pr.id = p.user_id
    where p.status = 'paid' and pr.role <> 'admin'
  ) then
    raise exception 'RESET_LOCKED';
  end if;

  select count(*) into v_therapists from profiles where role <> 'admin';
  select count(*) into v_bookings   from bookings;
  select count(*) into v_rooms      from rooms;
  select count(*) into v_branches   from branches;

  -- ═══ מחיקה בסדר שמכבד FK (רובם בלי cascade) ═══
  -- קודם מה שמצביע על bookings/payments/subscriptions, ורק בסוף auth.users.
  delete from overrun_charges;
  delete from payments;
  delete from bookings;
  delete from punch_cards;
  delete from session_subscriptions; -- session_slots יורדים ב-cascade
  delete from woo_pending_purchases;
  delete from room_blocks;
  delete from availability_events;
  delete from therapist_admin_notes;

  -- audit_log שורד: משחררים את ה-FK בלי למחוק את התיעוד עצמו.
  update audit_log
  set actor_id = null
  where actor_id in (select id from profiles where role <> 'admin');

  -- מחיקת חשבון ה-Auth מפילה את ה-profile ב-cascade
  -- (profiles.id references auth.users(id) on delete cascade).
  delete from auth.users
  where id in (select id from profiles where role <> 'admin');

  delete from rooms;
  delete from branches;

  -- ═══ שחזור תצורה לברירות המחדל ═══
  -- מדרגות: upsert לפי hours (UNIQUE) כדי לשמר את ה-id, ולכן גם את
  -- מיפוי מוצרי ה-Woo. מדרגות שנוספו ידנית מעבר לחמש — נמחקות.
  delete from woo_product_tiers
  where tier_id in (select id from punch_card_tiers where hours not in (10, 20, 30, 40, 50));

  delete from punch_card_tiers where hours not in (10, 20, 30, 40, 50);

  insert into punch_card_tiers (hours, price_per_hour, deposit_hours, active, sort_order)
  values (10, 55, 0, true, 1),
         (20, 50, 0, true, 2),
         (30, 45, 0, true, 3),
         (40, 40, 0, true, 4),
         (50, 35, 0, true, 5)
  on conflict (hours) do update set
    price_per_hour = excluded.price_per_hour,
    deposit_hours  = excluded.deposit_hours,
    active         = excluded.active,
    sort_order     = excluded.sort_order;

  -- הגדרות: חזרה לברירות המחדל. woo_session_product_id בכוונה לא נוגעים —
  -- זו הגדרת חנות, כמו מיפוי המוצרים.
  insert into app_settings (key, value)
  values ('vat_rate', '0.18'),
         ('buffer_minutes', '5'),
         ('booking_horizon_days', '30'),
         ('cancel_window_hours', '24'),
         ('sub_cancel_notice_days', '30'),
         ('session_base_price', '600'),
         ('session_base_hours', '5'),
         ('session_marginal_price', '110'),
         ('session_hold_hours', '72')
  on conflict (key) do update set value = excluded.value;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'system_reset_to_zero', 'system', null,
          jsonb_build_object(
            'therapists_deleted', v_therapists,
            'bookings_deleted', v_bookings,
            'rooms_deleted', v_rooms,
            'branches_deleted', v_branches
          ));

  return jsonb_build_object(
    'therapists_deleted', v_therapists,
    'bookings_deleted', v_bookings,
    'rooms_deleted', v_rooms,
    'branches_deleted', v_branches
  );
end;
$$ language plpgsql security definer set search_path = public;

-- האם האיפוס עדיין זמין? משמש את ה-UI כדי להסתיר/לנעול את הכפתור מראש,
-- במקום לתת לאדמין להקליד את מילת האישור ורק אז לגלות שזה נעול.
create or replace function is_system_reset_available()
returns boolean as $$
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  return not exists (
    select 1
    from payments p
    join profiles pr on pr.id = p.user_id
    where p.status = 'paid' and pr.role <> 'admin'
  );
end;
$$ language plpgsql security definer stable set search_path = public;
