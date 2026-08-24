-- ⚠️ בלתי הפיך. מנקה נתונים עסקיים שנשארו מבדיקות תחת חשבון האדמין עצמו
-- (oavital77@gmail.com) — הזמנות, ססיות (מנויים) פעילות, כרטיסיות, תשלומים,
-- חריגות, רשימת המתנה. לא נוגע בחשבון/ה-profile/ההרשאות עצמן — האדמין
-- ממשיך להתחבר עם אותו מייל וסיסמה בדיוק כמו קודם.
--
-- אותו סדר תלויות FK כמו 20260827000007 (bookings/payments/punch_cards/
-- session_subscriptions לפני auth.users) — כאן פשוט לא מגיעים ל-auth.users
-- בכלל.

delete from overrun_charges
where user_id = (select id from auth.users where email = 'oavital77@gmail.com')
   or booking_id in (
     select id from bookings
     where user_id = (select id from auth.users where email = 'oavital77@gmail.com')
   );

delete from payments
where user_id = (select id from auth.users where email = 'oavital77@gmail.com');

delete from bookings
where user_id = (select id from auth.users where email = 'oavital77@gmail.com');

delete from punch_cards
where user_id = (select id from auth.users where email = 'oavital77@gmail.com');

-- מוחק גם את session_slots ב-cascade (session_slots.subscription_id
-- references session_subscriptions(id) on delete cascade) — כולל שתי
-- הססיות הפעילות שממשיכות להיווצר מחדש בכל לילה ע"י ה-cron.
delete from session_subscriptions
where user_id = (select id from auth.users where email = 'oavital77@gmail.com');

delete from waitlist
where user_id = (select id from auth.users where email = 'oavital77@gmail.com');
