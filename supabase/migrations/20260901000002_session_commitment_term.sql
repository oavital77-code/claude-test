-- בקליניקה — טווח התחייבות לססיה (חודש / 3 חודשים / חצי שנה / שנה)
--
-- בקשת המשתמש: כשמאשרים בקשת ססיה, לבחור לכמה זמן קדימה "סוגרים" את
-- המשבצת למטפל/ת. בסיום הטווח — לא חידוש אוטומטי ולא פקיעה שקטה: נדרש
-- אישור אדמין מפורש להמשך (ר' שיחה איתו לפני המיגרציה).
--
-- החלטת עיצוב מרכזית: לא הוספנו טור/סטטוס חדש. p_term_months מתורגם
-- ל-effective_end_date הקיים (אותו טור ששולט כבר היום ב"עד מתי
-- materialize_subscription_bookings ממשיכה ליצור הזמנות" בזרימת הביטול
-- הרגילה). זה נותן חינם את התוצאה הרצויה: מהרגע שהטווח נגמר, אין יותר
-- הזמנות עתידיות חדשות למטפלת הזו, בלי לגעת ב-status או בקרון הקיים.
--
-- מה שכן היה חסר, ונוסף כאן: initiate_session_renewal_payment (המסלול
-- היחיד ליצור תשלום חידוש חודשי — גם עצמאי וגם מזומן ע"י אדמין) חסום
-- ברגע שה-effective_end_date עבר. בלי זה, אפשר היה להמשיך "לשלם על
-- החודש הבא" גם אחרי שהטווח שנסגר למטפלת כבר נגמר — חוסר עקביות בין
-- מה שהיא משלמת למה שהיא בפועל מקבלת (חדר). התשלום החודשי הרגיל בתוך
-- הטווח (חודש-בחודשו) ממשיך להיות עצמאי לגמרי, בלי שינוי.
--
-- שני RPCs חדשים לאדמין בסיום הטווח: admin_renew_session_term (בוחר
-- טווח חדש, מזיז את effective_end_date קדימה ומריץ מחדש materialize)
-- ו-admin_end_session_term (מסיים לגמרי — status='cancelled', בדיוק
-- כמו כל ססיה מבוטלת אחרת).

-- ═══ approve_session — מקבל p_term_months אופציונלי (null = ללא הגבלה, כהיום) ═══
drop function if exists approve_session(uuid);

create or replace function approve_session(p_subscription_id uuid, p_term_months integer default null)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_slot record;
  v_hold_hours numeric;
  v_effective_end date;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_term_months is not null and p_term_months not in (1, 3, 6, 12) then
    raise exception 'INVALID_TERM';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status <> 'requested' then
    raise exception 'FORBIDDEN';
  end if;

  for v_slot in select * from session_slots where subscription_id = p_subscription_id loop
    if session_slot_conflicts(
      v_slot.room_id, v_slot.weekday, v_slot.start_time, v_slot.end_time, 90, p_subscription_id
    ) then
      raise exception 'ROOM_TAKEN';
    end if;
  end loop;

  select (value#>>'{}')::numeric into v_hold_hours from app_settings where key = 'session_hold_hours';
  v_hold_hours := coalesce(v_hold_hours, 72);

  if p_term_months is not null then
    v_effective_end := coalesce(v_sub.start_date, current_date) + (p_term_months || ' months')::interval;
  end if;

  update session_subscriptions
  set status = 'awaiting_payment',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      hold_expires_at = now() + (v_hold_hours || ' hours')::interval,
      effective_end_date = coalesce(v_effective_end, effective_end_date)
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_approved', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('term_months', p_term_months, 'effective_end_date', v_effective_end));
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ admin_create_session — אותו p_term_months אופציונלי, אותה סמנטיקה ═══
drop function if exists admin_create_session(uuid, jsonb, date);

create or replace function admin_create_session(
  p_user_id uuid,
  p_slots jsonb,
  p_start_date date default null,
  p_term_months integer default null
)
returns table (subscription_id uuid, weekly_hours numeric, monthly_price numeric) as $$
declare
  v_status user_status;
  v_slot jsonb;
  v_weekly_hours numeric := 0;
  v_hold_hours numeric;
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

  select (value#>>'{}')::numeric into v_hold_hours from app_settings where key = 'session_hold_hours';
  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  v_hold_hours := coalesce(v_hold_hours, 72);
  v_base_price := coalesce(v_base_price, 600);

  insert into session_subscriptions (
    user_id, status, weekly_hours, monthly_price, start_date, hold_expires_at, reviewed_by, reviewed_at,
    effective_end_date
  )
  values (
    p_user_id, 'awaiting_payment', v_weekly_hours, v_base_price, v_start_date,
    now() + (v_hold_hours || ' hours')::interval, auth.uid(), now(),
    v_effective_end
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

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_created_by_admin', 'session_subscriptions', v_sub_id,
          jsonb_build_object(
            'user_id', p_user_id, 'weekly_hours', v_weekly_hours, 'start_date', v_start_date,
            'term_months', p_term_months, 'effective_end_date', v_effective_end
          ));

  return query select v_sub_id, v_weekly_hours, v_base_price;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ initiate_session_renewal_payment — חסימה אם הטווח שנסגר כבר נגמר ═══
create or replace function initiate_session_renewal_payment(p_subscription_id uuid)
returns table (payment_id uuid, amount_total numeric) as $$
declare
  v_sub session_subscriptions%rowtype;
  v_vat_rate numeric;
  v_vat numeric;
  v_total numeric;
  v_payment_id uuid;
begin
  select * into v_sub from session_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if v_sub.user_id <> auth.uid() and not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if v_sub.status not in ('active', 'pending_cancellation', 'expired') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;
  if v_sub.effective_end_date is not null and v_sub.effective_end_date < current_date then
    raise exception 'SESSION_TERM_ENDED';
  end if;

  select (value#>>'{}')::numeric into v_vat_rate from app_settings where key = 'vat_rate';
  v_vat_rate := coalesce(v_vat_rate, 0.18);
  v_vat := round(v_sub.monthly_price * v_vat_rate, 2);
  v_total := v_sub.monthly_price + v_vat;

  insert into payments (user_id, type, status, amount_before_vat, vat_amount, amount_total, subscription_id)
  values (v_sub.user_id, 'session_recurring', 'pending', v_sub.monthly_price, v_vat, v_total, p_subscription_id)
  returning id into v_payment_id;

  return query select v_payment_id, v_total;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ אדמין: חידוש הטווח שנסגר — טווח חדש קדימה מהיום ═══
create or replace function admin_renew_session_term(p_subscription_id uuid, p_term_months integer)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_new_end date;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_term_months not in (1, 3, 6, 12) then
    raise exception 'INVALID_TERM';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'expired') then
    raise exception 'FORBIDDEN';
  end if;

  v_new_end := current_date + (p_term_months || ' months')::interval;

  update session_subscriptions
  set effective_end_date = v_new_end
  where id = p_subscription_id;

  perform materialize_subscription_bookings(p_subscription_id, 90);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_term_renewed', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('term_months', p_term_months, 'effective_end_date', v_new_end));
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ אדמין: סיום ההתקשרות בתום הטווח — לא מחדשים ═══
create or replace function admin_end_session_term(p_subscription_id uuid)
returns void as $$
declare
  v_sub session_subscriptions%rowtype;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'expired') then
    raise exception 'FORBIDDEN';
  end if;

  update session_subscriptions
  set status = 'cancelled',
      effective_end_date = least(coalesce(effective_end_date, current_date), current_date)
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_term_ended_by_admin', 'session_subscriptions', p_subscription_id, '{}'::jsonb);
end;
$$ language plpgsql security definer set search_path = public;
