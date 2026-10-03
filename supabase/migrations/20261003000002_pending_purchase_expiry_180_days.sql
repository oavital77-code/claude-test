-- הארכת תוקף רכישה ממתינה מ-90 ל-180 יום.
--
-- רכישה ב-Woo שעדיין אין לה חשבון Cleana תואם נשמרת ב-woo_pending_purchases
-- ומחכה להרשמה. עם ההשקה שנדחתה, 90 יום הפכו לסיכון ממשי: הרכישות
-- הראשונות (15/09) היו פגות ב-14/12/2026, ולקוחה ששילמה ונרשמת אחר כך
-- לא הייתה מוצאת את השעות שלה. claim_woo_pending_purchase בודק
-- expires_at > now() — אז הארכת התאריך היא כל מה שנדרש.
--
-- שני חלקים: ברירת מחדל לרכישות עתידיות, והארכה של כל הממתינות הקיימות
-- ל-180 יום מרגע הגילוי (created_at) — לא מהיום, כדי שהחישוב יהיה עקבי.
-- רכישות שכבר נוצלו (claimed) לא נוגעים.

alter table woo_pending_purchases
  alter column expires_at set default now() + interval '180 days';

update woo_pending_purchases
set expires_at = created_at + interval '180 days'
where status = 'pending';
