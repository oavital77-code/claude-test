-- תיקון כוונה: האיפוס אינו נוגע יותר בחדרים ובסניפים.
--
-- הגרסה הקודמת (20260914000001) מחקה גם `rooms` ו-`branches`, על סמך
-- פירוש שגוי של "בלי שמירת חדרים" כ"בלי לשמור את החדרים". הכוונה הייתה
-- "בלי שמירת [=הזמנות] חדרים" — כלומר לנקות מטפלים ואת הרישום שלהם,
-- ולהשאיר את תשתית הקליניקה על כנה. בהרצה הראשונה נמחקו 10 חדרים ו-2
-- סניפים ושוחזרו ידנית מהסיד.
--
-- מה שהאיפוס עושה מעכשיו: מוחק מטפלים (כולל חשבונות ה-Auth, גם יתומים),
-- הזמנות, כרטיסיות, מנויי ססיה, תשלומים, חריגות, חסימות חדר ורכישות
-- ממתינות. משאיר: אדמינים, audit_log, **חדרים וסניפים**, ותצורת חנות.

create or replace function reset_system_to_zero(p_confirmation text)
returns jsonb as $$
declare
  v_therapists int;
  v_bookings   int;
  v_blocks     int;
  v_orphans    int;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_confirmation is distinct from 'מחק הכל' then
    raise exception 'INVALID_CONFIRMATION';
  end if;

  if exists (
    select 1
    from payments p
    join profiles pr on pr.id = p.user_id
    where p.status = 'paid' and pr.role <> 'admin'
  ) then
    raise exception 'RESET_LOCKED';
  end if;

  select count(*) into v_therapists from profiles where role <> 'admin';
  select count(*) into v_bookings   from bookings;
  select count(*) into v_blocks     from room_blocks;

  delete from overrun_charges;
  delete from payments;
  delete from bookings;
  delete from punch_cards;
  delete from session_subscriptions; -- session_slots יורדים ב-cascade
  delete from woo_pending_purchases;
  delete from room_blocks;
  delete from availability_events;
  delete from therapist_admin_notes;

  update audit_log
  set actor_id = null
  where actor_id in (select id from profiles where role <> 'admin');

  delete from auth.users
  where id in (select id from profiles where role <> 'admin');

  -- חשבונות Auth בלי profile — נרשמו ולא השלימו; בלי זה הם שורדים.
  with removed as (
    delete from auth.users u
    where not exists (select 1 from profiles p where p.id = u.id)
    returning 1
  )
  select count(*) into v_orphans from removed;

  -- ⚠️ rooms ו-branches נשארים בכוונה. אין כאן delete.

  delete from woo_product_tiers
  where tier_id in (select id from punch_card_tiers where hours not in (10, 20, 30, 40, 50));

  delete from punch_card_tiers where hours not in (10, 20, 30, 40, 50);

  insert into punch_card_tiers (hours, price_per_hour, deposit_hours, active, sort_order)
  values (10, 55, 0, true, 1),
         (20, 50, 0, true, 2),
         (30, 45, 0, true, 3),
         (40, 40, 0, true, 4),
         (50, 35, 0, true, 5)
  on conflict (hours) do update set
    price_per_hour = excluded.price_per_hour,
    deposit_hours  = excluded.deposit_hours,
    active         = excluded.active,
    sort_order     = excluded.sort_order;

  insert into app_settings (key, value)
  values ('vat_rate', '0.18'),
         ('buffer_minutes', '5'),
         ('booking_horizon_days', '30'),
         ('cancel_window_hours', '24'),
         ('sub_cancel_notice_days', '30'),
         ('session_base_price', '600'),
         ('session_base_hours', '5'),
         ('session_marginal_price', '110'),
         ('session_hold_hours', '72')
  on conflict (key) do update set value = excluded.value;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'system_reset_to_zero', 'system', null,
          jsonb_build_object(
            'therapists_deleted', v_therapists,
            'bookings_deleted', v_bookings,
            'blocks_deleted', v_blocks,
            'orphan_auth_users_deleted', v_orphans
          ));

  return jsonb_build_object(
    'therapists_deleted', v_therapists,
    'bookings_deleted', v_bookings,
    'blocks_deleted', v_blocks,
    'orphan_auth_users_deleted', v_orphans
  );
end;
$$ language plpgsql security definer set search_path = public;
