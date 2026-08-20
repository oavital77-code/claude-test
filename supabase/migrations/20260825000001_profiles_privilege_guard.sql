-- בקליניקה — סגירת חור אבטחה: מניעת העלאת הרשאות עצמית דרך עדכון פרופיל
--
-- 🔴 ממצא ביקורת קוד: edit_profile (UPDATE) ו-admin_insert_profile (INSERT)
-- בודקות רק בעלות שורה (id = auth.uid()), בלי WITH CHECK על אילו עמודות
-- מותר לשנות. מטפל יכול לקרוא ישירות ל-PostgREST:
--   PATCH /rest/v1/profiles?id=eq.<own-id>   { "role": "admin" }
-- ולהפוך את עצמו לאדמין מלא — גישה לכל RPC של אדמין, לכל היתרות/תשלומים
-- של כולם. אותה בעיה בדיוק עם status (עוקף השעיה), door_code, וטוקן
-- כרטיס האשראי השמור.
--
-- RLS לא יכול לבטא "העמודה הזו יכולה להשתנות רק אם אדמין" (WITH CHECK
-- משווה רק את השורה החדשה, בלי גישה נוחה לערך הישן/לתפקיד המבצע ברמת
-- העמודה) — הפתרון הנכון הוא trigger. פונקציות ה-RPC המהימנות שכן צריכות
-- לכתוב לשדות האלה (הפעלת ססיה, השעיה על כישלון חיוב) עוקפות את ה-trigger
-- דרך דגל GUC מקומי לטרנזקציה — לא ניתן לקריאה מהלקוח כי set_config אינו
-- חשוף דרך ה-REST API.

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
  else
    new.role := 'therapist';
    new.status := 'active';
    new.door_code := null;
    new.payplus_token_uid := null;
    new.card_last4 := null;
    new.card_expiry := null;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists profiles_privilege_guard on profiles;
create trigger profiles_privilege_guard
  before insert or update on profiles
  for each row execute function enforce_profile_privilege_columns();
