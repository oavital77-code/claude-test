-- ⚠️ בלתי הפיך. מוחק לצמיתות את כל חשבונות המטפלים (role='therapist') וכל
-- הנתונים העסקיים שלהם: הזמנות, כרטיסיות, ססיות, תשלומים, חריגות, יתרות
-- בהמתנה, ורשומות ה-Auth עצמן (כך שלא יוכלו להתחבר יותר עם הפרטים הישנים).
-- חשבונות אדמין (role='admin'), סניפים, חדרים, מדרגות מחיר והגדרות מערכת
-- לא נפגעים כלל. מיועד לאיפוס נקי לפני התחלת פיילוט.
--
-- הסדר קריטי: קודם הטבלאות שמצביעות על bookings/payments/punch_cards/
-- session_subscriptions (FK בלי cascade), ורק בסוף auth.users (מפיל profiles
-- ב-cascade). ר' README/OPERATIONS.md להרצה דרך Supabase SQL Editor.

delete from overrun_charges
where user_id in (select id from profiles where role = 'therapist')
   or booking_id in (
     select id from bookings
     where user_id in (select id from profiles where role = 'therapist')
   );

delete from payments
where user_id in (select id from profiles where role = 'therapist');

delete from bookings
where user_id in (select id from profiles where role = 'therapist');

delete from punch_cards
where user_id in (select id from profiles where role = 'therapist');

delete from session_subscriptions
where user_id in (select id from profiles where role = 'therapist');

delete from waitlist
where user_id in (select id from profiles where role = 'therapist');

delete from audit_log
where actor_id in (select id from profiles where role = 'therapist');

update room_blocks set created_by = null
where created_by in (select id from profiles where role = 'therapist');

-- מוחק גם את חשבון ה-Auth עצמו, לא רק את שורת ה-profile — profiles נמחקים
-- אוטומטית ב-cascade (profiles.id references auth.users(id) on delete cascade),
-- וכך גם admin_notes שנכתבו עליהם (אותו cascade).
delete from auth.users
where id in (select id from profiles where role = 'therapist');
