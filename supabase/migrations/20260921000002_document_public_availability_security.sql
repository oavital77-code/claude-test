-- תיעוד בלבד — אין כאן שינוי התנהגות.
--
-- public_availability היא view שנוצרה בלי security_invoker, כלומר היא רצה
-- בהרשאות הבעלים ו**עוקפת את ה-RLS של bookings**. זה מכוון, וזה מה שנושא
-- את כל המשקל של חוק ברזל #3: מטפל/ת חייבת לראות שמשבצת תפוסה, בלי לדעת
-- של מי היא. ה-view חושפת room_id/starts_at/ends_at/kind בלבד — אין
-- user_id, אין שם, ואין source (סוג ההזמנה).
--
-- ⚠️ ה-advisor של Supabase מסמן דפוס כזה כאזהרה (security_definer_view).
-- אל ת"תקנו" אותה בהוספת security_invoker = true: ברגע שה-RLS ייכנס
-- לתוקף, own_bookings תגביל כל מטפל/ת להזמנות של עצמה, הלוח יראה את כל
-- שאר המשבצות כפנויות, וכל ניסיון הזמנה ייפול על ה-EXCLUDE constraint
-- (ROOM_TAKEN) — או גרוע מכך, ייווצר רושם שהקליניקה ריקה.
--
-- ההגנה האמיתית על הנתונים היא צמצום העמודות ב-view עצמה, לא ה-RLS.

comment on view public_availability is
  'זמינות ציבורית לכל המטפלים. רצה בהרשאות הבעלים ועוקפת RLS בכוונה '
  '(חוק ברזל #3) — חושפת room_id/starts_at/ends_at/kind בלבד, בלי user_id '
  'ובלי source. אין להוסיף security_invoker ואין להוסיף עמודות מזהות.';
