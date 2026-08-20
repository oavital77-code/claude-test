-- בקליניקה — Realtime לזמינות (M2)
--
-- public_availability הוא VIEW — לא ניתן להאזין לו ישירות ב-Realtime (postgres_changes
-- עובד רק על טבלאות פיזיות עם replication). האזנה ישירה ל-bookings גם לא מתאימה: מדיניות
-- own_bookings מגבילה SELECT לשורות של המשתמש עצמו, ואותה הגבלה חלה גם על אירועי
-- Realtime — כלומר מטפל לעולם לא יקבל אירוע כשמטפל אחר תופס משבצת.
--
-- הפתרון: טבלת שידור מצומצמת וללא זיהוי משתמש (room_id/starts_at/ends_at/kind בלבד,
-- בדיוק כמו public_availability), עם RLS פתוח לקריאה, שמתמלאת ע"י triggers.
-- הקליינט מאזין אליה ומרענן את טווח התאריכים המוצג בעת אירוע רלוונטי.

create table availability_events (
  id          bigserial primary key,
  room_id     uuid not null references rooms(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  kind        text not null check (kind in ('booked','blocked')),
  action      text not null check (action in ('insert','delete')),
  created_at  timestamptz default now()
);
create index on availability_events (created_at desc);

alter table availability_events enable row level security;
create policy read_availability_events on availability_events for select using (true);

-- ═══ bookings → availability_events ═══
create or replace function emit_booking_availability_event() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (new.room_id, new.starts_at, new.ends_at, 'booked', 'insert');
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'confirmed' and new.status <> 'confirmed' then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (old.room_id, old.starts_at, old.ends_at, 'booked', 'delete');
    elsif old.status <> 'confirmed' and new.status = 'confirmed' then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (new.room_id, new.starts_at, new.ends_at, 'booked', 'insert');
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'confirmed' then
      insert into availability_events (room_id, starts_at, ends_at, kind, action)
      values (old.room_id, old.starts_at, old.ends_at, 'booked', 'delete');
    end if;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger bookings_availability_event
  after insert or update or delete on bookings
  for each row execute function emit_booking_availability_event();

-- ═══ room_blocks → availability_events ═══
create or replace function emit_room_block_availability_event() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into availability_events (room_id, starts_at, ends_at, kind, action)
    values (new.room_id, new.starts_at, new.ends_at, 'blocked', 'insert');
  elsif tg_op = 'UPDATE' then
    insert into availability_events (room_id, starts_at, ends_at, kind, action)
    values (old.room_id, old.starts_at, old.ends_at, 'blocked', 'delete');
    insert into availability_events (room_id, starts_at, ends_at, kind, action)
    values (new.room_id, new.starts_at, new.ends_at, 'blocked', 'insert');
  elsif tg_op = 'DELETE' then
    insert into availability_events (room_id, starts_at, ends_at, kind, action)
    values (old.room_id, old.starts_at, old.ends_at, 'blocked', 'delete');
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger room_blocks_availability_event
  after insert or update or delete on room_blocks
  for each row execute function emit_room_block_availability_event();

alter publication supabase_realtime add table availability_events;
