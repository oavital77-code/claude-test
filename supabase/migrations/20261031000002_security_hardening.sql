-- הקשחת אבטחה (בדיקה מעמיקה 31/10).
--
-- 1. availability_events — היסטוריית התפוסה (חדר + שעות, בלי שמות) הייתה
--    קריאה גם ל-anon (מדיניות using(true) ל-public + הרשאת ברירת המחדל של
--    Supabase), כלומר לכל מי שמחזיק את המפתח הציבורי, בלי להתחבר — כולל
--    הרשמה ל-Realtime. רק לוח המטפלים (משתמש מחובר) צריך אותה.
revoke all on table public.availability_events from anon;
drop policy if exists read_availability_events on public.availability_events;
create policy read_availability_events on public.availability_events
  for select to authenticated using (true);

-- 2. request_session(jsonb) — overload ישן שלא נמחק כשנוספה הגרסה עם
--    p_start_date. הוא עדיין בודק התנגשות משבצות (session_slot_conflicts)
--    בהרשאות owner, כך ש-ROOM_TAKEN חשף למטפל/ת שלמטפל/ת אחר/ת יש ססיה
--    במשבצת — בדיוק מה ש-20260828000013 הוציא מזרימת הבקשה (חוק ברזל #3).
--    האפליקציה קוראת רק לגרסה עם (p_slots, p_start_date).
drop function if exists public.request_session(jsonb);
