-- עצירת מייל "הרכישה שלך התקבלה" עד ההשקה.
--
-- ה-cron היומי (poll-woo-orders) קורא הזמנות מהחנות החיה baclinica.co.il,
-- וכל מי שקנה כרטיסייה קיבל מייל עם קישור הרשמה ל-cleana.co.il — לפני
-- שהמערכת הושקה בכלל. בפועל 11 לקוחות קיבלו את המייל בין 15/09 ל-01/10,
-- שתיים נרשמו תוך דקות, ואחת קבעה חדר שקיים רק ב-Cleana בזמן שהקליניקה
-- עדיין עובדת על המערכת הישנה.
--
-- הדגל עוצר את *המייל בלבד*. הרכישות ממשיכות להירשם ב-woo_pending_purchases
-- כרגיל, כך שביום ההשקה כל מי שקנתה בינתיים תמצא את השעות שלה מחכות ברגע
-- שתירשם. ערך מספרי (0/1) ולא boolean, כדי להתאים למנגנון ההגדרות הקיים
-- (updateAppSettingAction מקבל number) ולהופיע במסך ההגדרות בלי UI חדש.
--
-- ביום ההשקה: הגדרות → "מייל הזמנה להרשמה אחרי רכישה ב-Woo" → 1.

insert into app_settings (key, value)
select 'woo_purchase_email_enabled', '0'::jsonb
where not exists (select 1 from app_settings where key = 'woo_purchase_email_enabled');
