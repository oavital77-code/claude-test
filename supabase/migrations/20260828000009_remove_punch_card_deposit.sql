-- בקליניקה — ביטול זמני של הפיקדון בכרטיסייה (2 שעות לפי תעריף המדרגה)
--
-- בקשת בעל המערכת: לא לגבות פיקדון כרגע. הפתרון: deposit_hours=0 לכל
-- המדרגות הקיימות — לא מוחקים את מנגנון הפיקדון עצמו (עמודות
-- deposit_amount/deposit_remaining ב-punch_cards, admin_complete_deposit,
-- record_overrun) כי כרטיסיות קיימות כבר שילמו פיקדון אמיתי ועדיין
-- אוכפות אותו; רק כרטיסיות חדשות ייווצרו עם deposit_amount=0, מה שהופך את
-- הבדיקה "deposit_remaining = deposit_amount" (חוק ברזל #7) לתמיד-אמת
-- ואת DEPOSIT_DEPLETED ללא-רלוונטי עבורן, בלי לגעת בלוגיקת ה-RPCs.
--
-- ⚠️ לא נוגע במחיר בחנות ה-Woo (baclinica.co.il) — המחיר שהלקוח משלם שם
-- עדיין כולל את רכיב הפיקדון הישן עד שיעודכן ידנית בפאנל הניהול של
-- WooCommerce (המפתחות בסביבה הם Read בלבד, לא ניתן לעדכן משם).

update punch_card_tiers set deposit_hours = 0;
