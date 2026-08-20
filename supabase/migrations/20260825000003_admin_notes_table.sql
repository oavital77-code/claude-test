-- בקליניקה — סגירת חור אבטחה: admin_notes נחשף למטפל על עצמו
--
-- 🔴 ממצא ביקורת קוד: הכוונה המקורית בסכמה הייתה ש-admin_notes "לא נחשף
-- למטפל" (הערה ב-20260818000001), אבל מדיניות own_profile מאפשרת
-- SELECT על השורה המלאה כולל admin_notes למי שזו השורה שלו. RLS הוא
-- ברמת שורה, לא ברמת עמודה — אי אפשר לבטא "העמודה הזו חשופה רק אם
-- is_admin()" בתוך אותה מדיניות שגם מרשה בעלים לקרוא את שאר השורה.
--
-- הפתרון הנכון: טבלה נפרדת עם מדיניות RLS שהיא is_admin() בלבד, בלי סעיף
-- בעלות בכלל.

create table therapist_admin_notes (
  user_id     uuid primary key references profiles(id) on delete cascade,
  note        text,
  updated_at  timestamptz default now(),
  updated_by  uuid references profiles(id)
);

alter table therapist_admin_notes enable row level security;
create policy admin_only_notes on therapist_admin_notes for all using (is_admin());

insert into therapist_admin_notes (user_id, note)
select id, admin_notes from profiles where admin_notes is not null and admin_notes <> '';

alter table profiles drop column admin_notes;
