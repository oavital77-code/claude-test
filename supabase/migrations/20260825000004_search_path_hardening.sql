-- בקליניקה — סגירת חור אבטחה: search_path קבוע לכל פונקציית SECURITY DEFINER
--
-- 🔴 ממצא ביקורת קוד: אף אחת מפונקציות ה-SECURITY DEFINER לא קבעה search_path
-- משלה. ב-Postgres, סכימת pg_temp נבדקת תמיד לפני שאר ה-search_path (גם
-- למשתמש רגיל שיש לו הרשאת TEMP כברירת מחדל). מטפל יכול היה להריץ
-- CREATE TEMP TABLE profiles AS SELECT ... 'admin'::user_role AS role ...
-- ואז לקרוא לכל RPC — is_admin() (וכל שאר הפונקציות) היו קוראות מהטבלה
-- הזמנית המזויפת שלו במקום מ-public.profiles האמיתית.
--
-- התיקון: ALTER FUNCTION ... SET search_path קובע נתיב חיפוש קבוע לכל קריאה
-- לפונקציה, שלא כולל pg_temp במשתמע. לא דורש לכתוב מחדש את גוף הפונקציות.

alter function is_admin() set search_path = public;
alter function emit_booking_availability_event() set search_path = public;
alter function emit_room_block_availability_event() set search_path = public;
alter function create_punch_card_purchase(uuid) set search_path = public;
alter function set_payment_page_uid(uuid, text) set search_path = public;
alter function activate_punch_card_payment(uuid, text, payment_method, text) set search_path = public;
alter function mark_payment_failed(uuid, text) set search_path = public;
alter function create_booking(uuid, timestamptz, timestamptz) set search_path = public;
alter function cancel_booking(uuid) set search_path = public;
alter function session_slot_conflicts(uuid, int, time, time, int, uuid) set search_path = public;
alter function request_session(jsonb) set search_path = public;
alter function approve_session(uuid) set search_path = public;
alter function reject_session(uuid, text) set search_path = public;
alter function create_session_initial_payment(uuid) set search_path = public;
alter function materialize_subscription_bookings(uuid, int) set search_path = public;
alter function activate_session_payment(uuid, text, payment_method, text, text, text, text) set search_path = public;
alter function assert_service_or_admin() set search_path = public;
alter function materialize_session_bookings() set search_path = public;
alter function create_session_renewal_payment(uuid) set search_path = public;
alter function finalize_session_renewal(uuid, boolean, text, text, text) set search_path = public;
alter function request_subscription_cancellation(uuid) set search_path = public;
alter function expire_session_holds_and_cancellations() set search_path = public;
alter function preview_overrun(uuid, int) set search_path = public;
alter function record_overrun(uuid, int, text) set search_path = public;
alter function finalize_overrun_charge(uuid, boolean, text, text) set search_path = public;
alter function admin_complete_deposit(uuid) set search_path = public;
alter function grant_bonus_hours(uuid, numeric, text) set search_path = public;
alter function admin_cancel_booking(uuid, boolean) set search_path = public;
alter function admin_create_booking(uuid, uuid, timestamptz, timestamptz, text) set search_path = public;
