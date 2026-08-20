-- בקליניקה — לוח מלא לאדמין: שיבוץ ידני וביטול חריג (M6, §9)

-- ═══ ביטול הזמנה ע"י אדמין — עובד גם על הזמנות ססיה (חריג ידני, §3.2) ═══
create or replace function admin_cancel_booking(p_booking_id uuid, p_refund_hours boolean default false)
returns void as $$
declare
  v_booking bookings%rowtype;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found or v_booking.status <> 'confirmed' then
    raise exception 'BOOKING_PASSED';
  end if;

  if p_refund_hours and v_booking.punch_card_id is not null then
    update punch_cards
    set hours_remaining = hours_remaining + v_booking.hours_charged
    where id = v_booking.punch_card_id;
  end if;

  update bookings
  set status = 'cancelled_by_admin',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      hours_refunded = p_refund_hours
  where id = p_booking_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'booking_cancelled_by_admin', 'bookings', p_booking_id,
          jsonb_build_object('hours_refunded', p_refund_hours));
end;
$$ language plpgsql security definer;

-- ═══ שיבוץ ידני ע"י אדמין — ללא חיוב כרטיסייה (source='admin_comp') ═══
create or replace function admin_create_booking(
  p_user_id uuid,
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_note text default null
)
returns table (booking_id uuid) as $$
declare
  v_room_active boolean;
  v_booking_id uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'INVALID_SLOT';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  select active into v_room_active from rooms where id = p_room_id;
  if v_room_active is null or not v_room_active then
    raise exception 'ROOM_UNAVAILABLE';
  end if;

  begin
    insert into bookings (user_id, room_id, source, starts_at, ends_at, hours_charged, admin_note)
    values (p_user_id, p_room_id, 'admin_comp', p_starts_at, p_ends_at,
            extract(epoch from (p_ends_at - p_starts_at)) / 3600, p_note)
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'booking_created_by_admin', 'bookings', v_booking_id,
          jsonb_build_object('user_id', p_user_id, 'room_id', p_room_id));

  return query select v_booking_id;
end;
$$ language plpgsql security definer;
