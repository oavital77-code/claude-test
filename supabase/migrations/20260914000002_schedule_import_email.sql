-- ייבוא לו״ז מקובץ (הגדרות → ייבוא לו״ז): הקובץ כולל גם מייל של המטפל/ת,
-- שמשמש לשיוך החסימה לפרופיל אחרי שהיא נרשמת. שומרים אותו בעמודה ייעודית
-- ולא בתוך `reason`, כדי שה-label שמוצג בלוח יישאר נקי מ-PII (ר' ההחלטה
-- המקבילה בייבוא מ-Skedda).
--
-- room_blocks חשופה לאדמין בלבד (policy admin_room_blocks), ומטפלים רואים
-- זמינות רק דרך public_availability שאין בה לא reason ולא העמודה הזו.

alter table room_blocks add column if not exists imported_email text;

comment on column room_blocks.imported_email is
  'מייל מקובץ ייבוא הלו״ז — לשיוך עתידי לפרופיל. null לחסימות תחזוקה רגילות.';
