-- קיזוז חוב: נעילת הכרטיסיות לפני חישוב החוב (16/10, ממצא #5 בבדיקה).
--
-- קודם: סכום החוב חושב בלי נעילה, ואז UPDATE ל-0. אם create_booking (אשראי
-- שעות) חייב את אותה כרטיסייה במקביל, ה-UPDATE חיכה לנעילה ואיפס ערך עדכני
-- יותר מזה שנספר — עד שעה של חוב נמחקה. עכשיו: נועלים את כל הכרטיסיות של
-- המטפל/ת (FOR UPDATE) ורק אחר כך סוכמים — ב-READ COMMITTED השאילתה הבאה
-- אחרי ההמתנה רואה את הערך שכבר נשמר.

create or replace function absorb_punch_card_debt()
returns trigger as $$
declare
  v_debt numeric;
begin
  perform 1 from punch_cards where user_id = new.user_id for update;

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
