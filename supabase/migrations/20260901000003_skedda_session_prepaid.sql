-- בקליניקה — קליטת ססיה קבועה מ-Skedda: כבר שולם, אין לשלוח לתשלום שוב
--
-- תיקון לפי בקשת המשתמש: מטפלת ותיקה שההזמנה הקבועה שלה יובאה מ-Skedda
-- (ר' 20260828000010_import_skedda_blocks.sql) כבר שילמה על הססיה שלה
-- במערכת הישנה. admin_create_session (המסלול הרגיל לקביעת ססיה ע"י אדמין)
-- שולח תמיד ל-awaiting_payment ודורש תשלום אמיתי דרך Woo — נכון לססיה
-- *חדשה*, אבל שגוי כאן: זה יגרום לחיוב כפול על משהו שכבר שולם.
--
-- admin_create_session_prepaid דומה לגמרי ל-admin_create_session (אותה
-- ולידציה: שעות שבועיות, חדרים פעילים, יישור ל-30 דק'), אבל:
--   - נכנס ישר ל-status='active' (לא awaiting_payment) — אין תשלום ראשוני.
--   - next_billing_date נקבע חודש קדימה מ-start_date — התשלום החודשי
--     *הבא* ואילך ממשיך רגיל כמו כל ססיה (בלי חיוב כפול, לא בלי חיוב בכלל).
--   - מריץ מיד materialize_subscription_bookings וגם cleanup_skedda_import_blocks
--     (בדיוק כמו activate_session_payment הרגיל) — כי אין כאן "רגע הפעלה"
--     נפרד מהיצירה, הכל קורה אטומית באותה קריאה.
--
-- ⚠️ ייעודי אך ורק למסך "קליטה מ-Skedda". שימוש בו מחוץ להקשר הזה = מתן
-- ססיה בחינם, בניגוד לחוק ברזל #5 — לכן אין לו UI מלבד שם, ורק אדמין
-- יכול לקרוא לו.

create or replace function admin_create_session_prepaid(
  p_user_id uuid,
  p_slots jsonb,
  p_start_date date default null,
  p_term_months integer default null
)
returns table (subscription_id uuid) as $$
declare
  v_status user_status;
  v_slot jsonb;
  v_weekly_hours numeric := 0;
  v_base_price numeric;
  v_base_hours numeric;
  v_start_date date;
  v_effective_end date;
  v_sub_id uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_term_months is not null and p_term_months not in (1, 3, 6, 12) then
    raise exception 'INVALID_TERM';
  end if;

  select status into v_status from profiles where id = p_user_id;
  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'active' then
    raise exception 'USER_SUSPENDED';
  end if;

  if p_slots is null or jsonb_array_length(p_slots) = 0 then
    raise exception 'INVALID_SLOT';
  end if;

  if p_start_date is not null and p_start_date < current_date then
    raise exception 'INVALID_START_DATE';
  end if;
  v_start_date := coalesce(p_start_date, current_date);

  if p_term_months is not null then
    v_effective_end := v_start_date + (p_term_months || ' months')::interval;
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if (v_slot->>'weekday')::int not between 0 and 6 then
      raise exception 'INVALID_SLOT';
    end if;
    if (v_slot->>'end_time')::time <= (v_slot->>'start_time')::time then
      raise exception 'INVALID_SLOT';
    end if;
    if extract(epoch from (v_slot->>'start_time')::time)::int % 1800 <> 0
       or extract(epoch from (v_slot->>'end_time')::time)::int % 1800 <> 0 then
      raise exception 'INVALID_SLOT';
    end if;
    if not exists (select 1 from rooms where id = (v_slot->>'room_id')::uuid and active) then
      raise exception 'ROOM_UNAVAILABLE';
    end if;

    v_weekly_hours := v_weekly_hours
      + extract(epoch from ((v_slot->>'end_time')::time - (v_slot->>'start_time')::time)) / 3600;
  end loop;

  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  v_base_hours := coalesce(v_base_hours, 5);

  if v_weekly_hours <> v_base_hours then
    raise exception 'SESSION_HOURS_FIXED';
  end if;

  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  v_base_price := coalesce(v_base_price, 600);

  insert into session_subscriptions (
    user_id, status, weekly_hours, monthly_price, start_date, next_billing_date,
    reviewed_by, reviewed_at, effective_end_date
  )
  values (
    p_user_id, 'active', v_weekly_hours, v_base_price, v_start_date,
    v_start_date + interval '1 month', auth.uid(), now(), v_effective_end
  )
  returning id into v_sub_id;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    insert into session_slots (subscription_id, room_id, weekday, start_time, end_time)
    values (
      v_sub_id,
      (v_slot->>'room_id')::uuid,
      (v_slot->>'weekday')::int,
      (v_slot->>'start_time')::time,
      (v_slot->>'end_time')::time
    );
  end loop;

  perform materialize_subscription_bookings(v_sub_id, 90);
  perform cleanup_skedda_import_blocks(v_sub_id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_created_prepaid_migration', 'session_subscriptions', v_sub_id,
          jsonb_build_object(
            'user_id', p_user_id, 'weekly_hours', v_weekly_hours, 'start_date', v_start_date,
            'term_months', p_term_months, 'effective_end_date', v_effective_end,
            'note', 'הועבר מ-Skedda — שולם כבר במערכת הישנה, בלי חיוב ראשוני'
          ));

  return query select v_sub_id;
end;
$$ language plpgsql security definer set search_path = public;
