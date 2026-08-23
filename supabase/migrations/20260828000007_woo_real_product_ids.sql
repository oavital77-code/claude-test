-- בקליניקה — מיפוי אמיתי ל-Product ID-ים בחנות ה-Woo (baclinica.co.il),
-- שהתקבלו מהמפתח של האתר. תואם לפי hours (לא UUID קשיח) כדי שהמיגרציה תהיה
-- נכונה גם אם ה-seed רץ עם מזהים שונים.

insert into woo_product_tiers (woo_product_id, tier_id)
select v.woo_product_id, t.id
from (values
  (378, 10),
  (379, 20),
  (380, 30),
  (381, 40),
  (382, 50)
) as v(woo_product_id, hours)
join punch_card_tiers t on t.hours = v.hours
on conflict (woo_product_id) do update set tier_id = excluded.tier_id;

update app_settings set value = '333'::jsonb where key = 'woo_session_product_id';
