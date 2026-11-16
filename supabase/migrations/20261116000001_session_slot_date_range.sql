-- ניהול ססיות: "החל מ… עד…" לכל משבצת שבועית (בקשת הבעלים, 16/11).
--
-- 1. לכל משבצת יש תאריך התחלה. משבצות קיימות בלי valid_from מתחילות ב-13/10/2026
--    (יום ההשקה). המזהים נשמרים ב-audit_log כדי שאפשר יהיה להחזיר.
--    משבצת חדשה בלי valid_from מקבלת את תאריך ההתחלה של הססיה (טריגר).
--    מבחינת שיבוץ זה שקול לחלוטין ל-null: materialize ממילא לא יוצר מפגש לפני
--    start_date של הססיה, ואין ססיה שמתחילה לפני 13/10.
-- 2. שינוי משבצת, הוספת משבצת והסרת משבצת מקבלים p_until אופציונלי:
--    - שינוי זמני: מ-p_from עד p_until המשבצת החדשה, ומ-p_until+1 חוזרים
--      אוטומטית למשבצת המקורית (משבצת המשך עם אותם חדר/יום/שעות).
--    - הסרה זמנית (השהיה): מ-p_from עד p_until אין מפגשים, ואחריו המשבצת חוזרת.
--    - הוספה תחומה: המשבצת החדשה בתוקף רק עד p_until.
--    רק המפגשים שבטווח מתבטלים — מה שאחרי p_until נשאר כמו שהוא.
--    בלי p_until — בדיוק ההתנהגות הקודמת (הקוד שבפרודקשן ממשיך לעבוד).
-- 3. שעות שבועיות (refresh_session_weekly_hours) נספרות ממשבצות פתוחות בלבד,
--    כך שהוספה/שינוי זמניים לא משנים את המחיר או את השעות של המנוי.

-- 1. מילוי תאריך התחלה --------------------------------------------------------

insert into audit_log (actor_id, action, entity, entity_id, after)
select null, 'session_slots_valid_from_backfilled', 'session_slots', null,
       jsonb_build_object('valid_from', '2026-10-13', 'slot_ids', coalesce(jsonb_agg(id), '[]'::jsonb),
                          'undo', 'update session_slots set valid_from = null where id in (<slot_ids>)')
from session_slots where valid_from is null;

update session_slots set valid_from = date '2026-10-13' where valid_from is null;

create or replace function public.session_slots_default_valid_from()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.valid_from is null then
    select coalesce(start_date, current_date) into new.valid_from
    from session_subscriptions where id = new.subscription_id;
    new.valid_from := coalesce(new.valid_from, current_date);
  end if;
  return new;
end;
$$;

drop trigger if exists session_slots_default_valid_from on session_slots;
create trigger session_slots_default_valid_from
  before insert on session_slots
  for each row execute function session_slots_default_valid_from();

-- ביטול מפגשי משבצת בטווח תאריכים (p_until null = בלי סוף, כמו cancel_slot_bookings_from).
create or replace function public.cancel_slot_bookings_between(p_slot_id uuid, p_from date, p_until date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_slot session_slots%rowtype;
  v_count integer;
begin
  select * into v_slot from session_slots where id = p_slot_id;
  update bookings
  set status = 'cancelled_by_admin', cancelled_at = now(), cancelled_by = auth.uid(), hours_refunded = false,
      admin_note = 'סוף משבצת (ניהול ססיות)'
  where subscription_id = v_slot.subscription_id
    and status = 'confirmed'
    and room_id = v_slot.room_id
    and extract(dow from (starts_at at time zone 'Asia/Jerusalem'))::int = v_slot.weekday
    and (starts_at at time zone 'Asia/Jerusalem')::time = v_slot.start_time
    and (starts_at at time zone 'Asia/Jerusalem')::date >= p_from
    and (p_until is null or (starts_at at time zone 'Asia/Jerusalem')::date <= p_until);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.cancel_slot_bookings_between(uuid, date, date) from public, anon, authenticated;

-- 2a. שינוי משבצת ------------------------------------------------------------

drop function if exists public.admin_session_change_slot(uuid, uuid, integer, time, time, date);
create function public.admin_session_change_slot(
  p_slot_id uuid, p_room_id uuid, p_weekday integer, p_start_time time, p_end_time time,
  p_from date, p_until date default null)
returns table(cancelled integer, conflicts integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old session_slots%rowtype;
  v_sub session_subscriptions%rowtype;
  v_new_id uuid;
  v_cont_id uuid;
  v_cancelled integer;
  v_conflicts integer;
  v_t0 timestamptz := now();
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  perform assert_valid_session_slot(p_room_id, p_weekday, p_start_time, p_end_time);

  select * into v_old from session_slots where id = p_slot_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_sub from session_subscriptions where id = v_old.subscription_id for update;
  if v_sub.status not in ('active', 'pending_cancellation') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;
  if p_from is null or p_from < current_date then
    raise exception 'INVALID_START_DATE';
  end if;
  if p_until is not null and p_until < p_from then
    raise exception 'INVALID_END_DATE';
  end if;

  v_cancelled := cancel_slot_bookings_between(p_slot_id, p_from, p_until);
  update session_slots set valid_until = p_from - 1 where id = p_slot_id;

  insert into session_slots (subscription_id, room_id, weekday, start_time, end_time, valid_from, valid_until)
  values (v_old.subscription_id, p_room_id, p_weekday, p_start_time, p_end_time,
          greatest(p_from, coalesce(v_old.valid_from, p_from)),
          case when p_until is null then v_old.valid_until
               else least(p_until, coalesce(v_old.valid_until, p_until)) end)
  returning id into v_new_id;

  -- שינוי זמני: אחרי p_until חוזרים למשבצת המקורית.
  if p_until is not null and (v_old.valid_until is null or p_until < v_old.valid_until) then
    insert into session_slots (subscription_id, room_id, weekday, start_time, end_time, valid_from, valid_until)
    values (v_old.subscription_id, v_old.room_id, v_old.weekday, v_old.start_time, v_old.end_time,
            p_until + 1, v_old.valid_until)
    returning id into v_cont_id;
  end if;

  perform refresh_session_weekly_hours(v_old.subscription_id);
  perform materialize_subscription_bookings(v_old.subscription_id, 90);

  select count(*) into v_conflicts from audit_log
  where action = 'session_materialization_conflict' and entity_id = v_old.subscription_id and created_at >= v_t0;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_slot_changed_by_admin', 'session_subscriptions', v_old.subscription_id,
          jsonb_build_object('old_slot', p_slot_id, 'new_slot', v_new_id, 'from', p_from, 'until', p_until,
                             'continuation_slot', v_cont_id,
                             'room_id', p_room_id, 'weekday', p_weekday, 'start', p_start_time, 'end', p_end_time,
                             'cancelled', v_cancelled, 'conflicts', v_conflicts));

  return query select v_cancelled, v_conflicts;
end;
$$;

-- 2b. הוספת משבצת ------------------------------------------------------------

drop function if exists public.admin_session_add_slot_from(uuid, uuid, integer, time, time, date);
create function public.admin_session_add_slot_from(
  p_subscription_id uuid, p_room_id uuid, p_weekday integer, p_start_time time, p_end_time time,
  p_from date, p_until date default null)
returns table(conflicts integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub session_subscriptions%rowtype;
  v_new_id uuid;
  v_conflicts integer;
  v_t0 timestamptz := now();
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  perform assert_valid_session_slot(p_room_id, p_weekday, p_start_time, p_end_time);
  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'pending_cancellation') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;
  if p_from is null or p_from < current_date then
    raise exception 'INVALID_START_DATE';
  end if;
  if p_until is not null and p_until < p_from then
    raise exception 'INVALID_END_DATE';
  end if;

  insert into session_slots (subscription_id, room_id, weekday, start_time, end_time, valid_from, valid_until)
  values (p_subscription_id, p_room_id, p_weekday, p_start_time, p_end_time, p_from, p_until)
  returning id into v_new_id;

  perform refresh_session_weekly_hours(p_subscription_id);
  perform materialize_subscription_bookings(p_subscription_id, 90);

  select count(*) into v_conflicts from audit_log
  where action = 'session_materialization_conflict' and entity_id = p_subscription_id and created_at >= v_t0;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_slot_added_by_admin', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('slot', v_new_id, 'from', p_from, 'until', p_until, 'conflicts', v_conflicts));
  return query select v_conflicts;
end;
$$;

-- 2c. הסרת משבצת (עם p_until = השהיה) ------------------------------------------

drop function if exists public.admin_session_remove_slot(uuid, date);
create function public.admin_session_remove_slot(p_slot_id uuid, p_from date, p_until date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_slot session_slots%rowtype;
  v_cont_id uuid;
  v_cancelled integer;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_slot from session_slots where id = p_slot_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if p_from is null or p_from < current_date then
    raise exception 'INVALID_START_DATE';
  end if;
  if p_until is not null and p_until < p_from then
    raise exception 'INVALID_END_DATE';
  end if;

  v_cancelled := cancel_slot_bookings_between(p_slot_id, p_from, p_until);
  update session_slots set valid_until = p_from - 1 where id = p_slot_id;

  -- השהיה: אחרי p_until המשבצת חוזרת (המפגשים שאחרי הטווח לא בוטלו בכלל).
  if p_until is not null and (v_slot.valid_until is null or p_until < v_slot.valid_until) then
    insert into session_slots (subscription_id, room_id, weekday, start_time, end_time, valid_from, valid_until)
    values (v_slot.subscription_id, v_slot.room_id, v_slot.weekday, v_slot.start_time, v_slot.end_time,
            p_until + 1, v_slot.valid_until)
    returning id into v_cont_id;
  end if;

  perform refresh_session_weekly_hours(v_slot.subscription_id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_slot_removed_by_admin', 'session_subscriptions', v_slot.subscription_id,
          jsonb_build_object('slot', p_slot_id, 'from', p_from, 'until', p_until,
                             'continuation_slot', v_cont_id, 'cancelled', v_cancelled));
  return v_cancelled;
end;
$$;
