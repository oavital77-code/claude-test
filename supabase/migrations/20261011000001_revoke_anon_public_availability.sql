-- public_availability הייתה קריאה גם ל-anon (משתמש לא מחובר).
--
-- 20260818000002_rls.sql נתן במפורש select רק ל-authenticated, אבל ה-default
-- privileges של Supabase מעניקים אוטומטית הרשאות לכל אובייקט חדש בסכמת public
-- גם ל-anon — וזה עקף את הכוונה. נבדק 11/10: has_table_privilege('anon', ...)
-- = true. כלומר כל מי שמחזיק את ה-anon key (שנמצא בבאנדל של הדפדפן) יכול
-- היה לקרוא את לוח התפוסה של כל החדרים, בלי להתחבר. בלי שמות או user_id
-- (ה-view לא חושף אותם), אבל זה מידע עסקי שלא אמור להיות פתוח לעולם.
--
-- הקוד קורא את ה-view רק מ-lib/availability/queries.ts, שנקרא רק מלוח המטפל/ת
-- (requireTherapistProfile) ומלוח האדמין (requireAdmin) — שניהם מחוברים.

revoke all on public.public_availability from anon;
grant select on public.public_availability to authenticated;
