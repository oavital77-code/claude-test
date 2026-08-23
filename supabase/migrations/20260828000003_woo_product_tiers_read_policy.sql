-- בקליניקה — תיקון: woo_product_tiers היה admin-only ל-select, אבל
-- initiatePunchCardPurchase (app/(app)/purchase/actions.ts) קורא אותו
-- בהקשר המטפל/ת עצמו/ה (לא admin client) כדי לדעת לאיזה מוצר ב-Woo
-- להפנות. אין כאן מידע רגיש (מיפוי tier -> product id ציבורי ממילא בחנות).

create policy read_woo_product_tiers on woo_product_tiers for select using (true);
