-- בקליניקה — סגירת שני חורי אבטחה מביקורת קוד:
--
-- 🔴 #1 עקיפת תשלום מלאה: assert_service_or_admin() התייחס ל-"auth.uid()
-- הוא null" כהוכחה שהקורא הוא הקשר service-role מהימן (webhook/cron). אבל
-- auth.uid() הוא null גם עבור קריאה עם ה-anon key הציבורי בלבד, בלי משתמש
-- מחובר (ה-JWT של ה-anon key אין לו sub claim — בדיוק כמו ה-service key).
-- כתוצאה מכך מטפל (או כל אחד) יכול לקרוא ישירות ל-
--   POST /rest/v1/rpc/activate_session_payment   (או finalize_session_renewal,
--   activate_punch_card_payment, mark_payment_failed וכו')
-- עם ה-anon key בלבד (בלי Authorization: Bearer של משתמש מחובר) על payment
-- pending שהוא כבר יצר לעצמו, ולקבל כרטיסייה/ססיה מלאה בלי לשלם באמת —
-- עקיפה מוחלטת של חוק ברזל #6. התיקון: לבדוק את ה-role בפועל של ה-JWT
-- (auth.role(), שקוראת request.jwt.claim.role) במקום את קיום ה-uid.
--
-- 🔴 #2 גניבת רכישת Woo של אדם אחר: enforce_profile_privilege_columns נעל
-- role/status/door_code/payplus_token_uid/card_last4/card_expiry מפני עריכה
-- עצמית, אבל לא phone/email. מטפל שכבר נרשם יכול לקרוא ישירות ל-
--   PATCH /rest/v1/profiles?id=eq.<own-id>   { "phone": "<טלפון של קורבן>" }
-- ואז claim_woo_pending_purchase (שרץ אוטומטית בכל טעינת עמוד, ר'
-- app/(app)/layout.tsx) יתאים לו רכישה ששולמה ע"י מישהו אחר שעדיין לא נרשם
-- למערכת, לפי התאמת phone/email בלבד. אין כרגע מסך עריכת פרופיל עצמית —
-- אין שימוש לגיטימי בשינוי phone/email אחרי הרשמה מחוץ להקשר אדמין.

create or replace function assert_service_or_admin() returns void as $$
begin
  if auth.role() = 'service_role' then
    return;
  end if;
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
end;
$$ language plpgsql security definer stable set search_path = public;

create or replace function enforce_profile_privilege_columns() returns trigger as $$
begin
  if current_setting('baclinica.trusted_write', true) = 'on' then
    return new;
  end if;

  if is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.role := old.role;
    new.status := old.status;
    new.door_code := old.door_code;
    new.payplus_token_uid := old.payplus_token_uid;
    new.card_last4 := old.card_last4;
    new.card_expiry := old.card_expiry;
    new.phone := old.phone;
    new.email := old.email;
  else
    new.role := 'therapist';
    new.status := 'active';
    new.door_code := null;
    new.payplus_token_uid := null;
    new.card_last4 := null;
    new.card_expiry := null;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
