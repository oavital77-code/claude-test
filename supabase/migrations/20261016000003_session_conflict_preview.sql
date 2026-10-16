-- תצוגה מקדימה של התנגשויות לפני שמירת ססיה (ניהול ססיות, 16/10).
--
-- הקוד מחשב את המפגשים העתידיים (lib/sessions/occurrences.ts, אופק 90 יום
-- כמו ה-materialize) ושולח אותם כטווחים; כאן בודקים מול כל ההזמנות
-- המאושרות בכל מקור (כרטיסייה, ססיה, שיבוץ אדמין) ומול חסימות חדר:
--   • room   — אותו חדר, זמן חופף (מטפל/ת אחר/ת או אותו/ה מטפל/ת)
--   • self   — אותו/ה מטפל/ת בחדר אחר באותה שעה (היה נחסם כ-SELF_OVERLAP)
--   • block  — חסימת חדר
-- קריאה בלבד, אדמין בלבד. שום דבר לא נדרס בפועל גם בלי זה (constraint ה-
-- exclusion ב-DB) — המטרה היא שהאדמין יראה מראש אילו מפגשים לא ייקבעו.

create or replace function admin_session_slot_conflicts(
  p_ranges jsonb,                       -- [{room_id, starts_at, ends_at}]
  p_user_id uuid default null,
  p_exclude_subscription_id uuid default null,
  p_exclude_booking_id uuid default null
)
returns table (
  kind text, room_id uuid, starts_at timestamptz, ends_at timestamptz,
  other_user_id uuid, source text, block_reason text
) as $$
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  return query
  with r as (
    select x.room_id, x.starts_at, x.ends_at
    from jsonb_to_recordset(p_ranges) as x(room_id uuid, starts_at timestamptz, ends_at timestamptz)
  )
  select distinct on (b.id)
    case when b.room_id = r.room_id then 'room' else 'self' end,
    b.room_id, b.starts_at, b.ends_at, b.user_id, b.source::text, null::text
  from r
  join bookings b
    on b.status = 'confirmed'
   and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(r.starts_at, r.ends_at, '[)')
   and (b.room_id = r.room_id or (p_user_id is not null and b.user_id = p_user_id))
  where (p_exclude_subscription_id is null or b.subscription_id is distinct from p_exclude_subscription_id)
    and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)

  union all

  select distinct
    'block', rb.room_id, rb.starts_at, rb.ends_at, null::uuid, null::text, rb.reason
  from r
  join room_blocks rb
    on rb.room_id = r.room_id
   and tstzrange(rb.starts_at, rb.ends_at, '[)') && tstzrange(r.starts_at, r.ends_at, '[)');
end;
$$ language plpgsql stable security definer set search_path = public;

revoke all on function admin_session_slot_conflicts(jsonb, uuid, uuid, uuid) from public, anon;
grant execute on function admin_session_slot_conflicts(jsonb, uuid, uuid, uuid) to authenticated;
