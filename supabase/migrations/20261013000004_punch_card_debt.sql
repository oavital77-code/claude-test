-- בקליניקה — יתרת שעות במינוס (13/10).
--
-- בקשת הבעלים במעבר מ-Skedda: שיבוצים ידניים של אדמין קוזזו מהכרטיסייה,
-- ומי שלא הייתה לו מספיק יתרה — "תעשה להם מינוס". לכן:
--   1. hours_non_negative יורד — כרטיסייה יכולה להיות במינוס. זה לא פותח
--      הזמנה בלי יתרה (חוק #7): create_booking עדיין בוחר רק כרטיסייה עם
--      hours_remaining >= hours, אז מינוס חוסם הזמנות עצמאיות עד רכישה.
--   2. absorb_punch_card_debt — בכל כרטיסייה חדשה (רכישת Woo, שיוך ידני,
--      העברה מ-Skedda) החוב מהכרטיסיות הקודמות מקוזז ממנה, והקודמות חוזרות
--      ל-0. בלי זה, החוב היה נשאר על כרטיסייה ישנה והשעות החדשות היו מלאות.
--
-- ⚠️ השורה הראשונה (DROP) הורצה ידנית ב-SQL Editor — חיבור ה-MCP לא מריץ DROP.

alter table punch_cards drop constraint if exists hours_non_negative;

create or replace function absorb_punch_card_debt()
returns trigger as $$
declare
  v_debt numeric;
begin
  select coalesce(sum(hours_remaining), 0) into v_debt
  from punch_cards
  where user_id = new.user_id and hours_remaining < 0;

  if v_debt < 0 then
    update punch_cards set hours_remaining = 0
    where user_id = new.user_id and hours_remaining < 0;

    new.hours_remaining := new.hours_remaining + v_debt;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(), 'punch_card_debt_absorbed', 'punch_cards', new.id,
            jsonb_build_object('user_id', new.user_id, 'debt_hours', -v_debt));
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace trigger punch_cards_absorb_debt
  before insert on punch_cards
  for each row execute function absorb_punch_card_debt();
