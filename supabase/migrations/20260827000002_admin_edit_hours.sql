-- אדמין: עריכת שעות למשתמשים קיימים — כרטיסייה (כרטיס ספציפי, לא רק "מתנה"
-- חדשה) וססיה (הוספת משבצת שבועית לססיה פעילה). ר' גם 20260827000001 שהסיר
-- את דרישת המינימום 5 שעות — אבל ה-CHECK constraint המקורי על הטבלה עדיין
-- אכף את זה ברמת ה-DB ופוספס אז. מתקן את זה כאן.

alter table session_subscriptions drop constraint session_subscriptions_weekly_hours_check;
alter table session_subscriptions add constraint session_subscriptions_weekly_hours_check check (weekly_hours > 0);

-- ═══ התאמת שעות על כרטיסייה קיימת (בניגוד ל-grant_bonus_hours, שיוצר כרטיסייה חדשה) ═══
create or replace function admin_adjust_punch_card_hours(
  p_card_id uuid,
  p_hours_delta numeric,
  p_note text
) returns void as $$
declare
  v_card punch_cards%rowtype;
  v_new_hours numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_hours_delta = 0 then
    raise exception 'INVALID_SLOT';
  end if;

  select * into v_card from punch_cards where id = p_card_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  v_new_hours := v_card.hours_remaining + p_hours_delta;
  if v_new_hours < 0 then
    raise exception 'INSUFFICIENT_HOURS';
  end if;

  update punch_cards set hours_remaining = v_new_hours where id = p_card_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'admin_adjusted_punch_card_hours', 'punch_cards', p_card_id,
          jsonb_build_object('delta', p_hours_delta, 'new_hours_remaining', v_new_hours, 'note', p_note));
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ הוספת משבצת שבועית לססיה פעילה (מגדיל weekly_hours + monthly_price,
--     ומשבץ הזמנות אמיתיות מיידית ל-90 הימים הבאים) ═══
create or replace function admin_add_session_slot(
  p_subscription_id uuid,
  p_room_id uuid,
  p_weekday int,
  p_start_time time,
  p_end_time time
) returns void as $$
declare
  v_sub session_subscriptions%rowtype;
  v_horizon_days constant int := 90;
  v_base_price numeric;
  v_base_hours numeric;
  v_marginal_price numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  if v_sub.status not in ('active', 'pending_cancellation') then
    raise exception 'INVALID_SLOT';
  end if;

  if p_weekday not between 0 and 6 then
    raise exception 'INVALID_SLOT';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'INVALID_SLOT';
  end if;
  if extract(epoch from p_start_time)::int % 1800 <> 0
     or extract(epoch from p_end_time)::int % 1800 <> 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if not exists (select 1 from rooms where id = p_room_id and active) then
    raise exception 'ROOM_UNAVAILABLE';
  end if;
  if session_slot_conflicts(p_room_id, p_weekday, p_start_time, p_end_time, v_horizon_days, p_subscription_id) then
    raise exception 'ROOM_TAKEN';
  end if;

  insert into session_slots (subscription_id, room_id, weekday, start_time, end_time)
  values (p_subscription_id, p_room_id, p_weekday, p_start_time, p_end_time);

  select (value#>>'{}')::numeric into v_base_price from app_settings where key = 'session_base_price';
  select (value#>>'{}')::numeric into v_base_hours from app_settings where key = 'session_base_hours';
  select (value#>>'{}')::numeric into v_marginal_price from app_settings where key = 'session_marginal_price';
  v_base_price := coalesce(v_base_price, 600);
  v_base_hours := coalesce(v_base_hours, 5);
  v_marginal_price := coalesce(v_marginal_price, 110);

  update session_subscriptions
  set weekly_hours = (
        select coalesce(sum(extract(epoch from (end_time - start_time)) / 3600), 0)
        from session_slots where subscription_id = p_subscription_id
      ),
      monthly_price = v_base_price + greatest(
        0,
        (select coalesce(sum(extract(epoch from (end_time - start_time)) / 3600), 0)
         from session_slots where subscription_id = p_subscription_id) - v_base_hours
      ) * v_marginal_price
  where id = p_subscription_id;

  perform materialize_subscription_bookings(p_subscription_id, v_horizon_days);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'admin_added_session_slot', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('room_id', p_room_id, 'weekday', p_weekday, 'start_time', p_start_time, 'end_time', p_end_time));
end;
$$ language plpgsql security definer set search_path = public;
