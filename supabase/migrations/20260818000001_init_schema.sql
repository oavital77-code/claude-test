-- בקליניקה — סכמת בסיס (M0)
-- ר' baclinica-spec.md §5.1-5.3

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ═══ ENUMs ═══
create type user_role        as enum ('therapist','admin');
create type user_status      as enum ('active','suspended','archived');
create type room_type        as enum ('talk','touch','podcast','group');
create type booking_source   as enum ('punch_card','session','admin_comp');
create type booking_status   as enum ('confirmed','cancelled_by_user','cancelled_by_admin','completed','no_show');
create type sub_status       as enum ('requested','rejected','awaiting_payment','active','pending_cancellation','cancelled','expired');
create type payment_type     as enum ('punch_card','session_initial','session_recurring','overrun','deposit_topup');
create type payment_status   as enum ('pending','paid','failed','refunded');
create type payment_method   as enum ('credit_card','bit','paybox');
create type overrun_source   as enum ('deposit','charge');

-- ═══ הגדרות מערכת ═══
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz default now()
);

-- ═══ סניפים וחדרים ═══
create table branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text not null,
  waze_url    text,
  phone       text,
  active      boolean default true,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table rooms (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references branches(id) on delete restrict,
  name         text not null,
  room_type    room_type not null default 'talk',
  capacity     int default 2,
  description  text,
  equipment    jsonb default '[]'::jsonb,
  images       text[] default '{}',
  active       boolean default true,
  sort_order   int default 0,
  created_at   timestamptz default now(),
  unique (branch_id, name)
);

-- ═══ משתמשים ═══
create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  role               user_role not null default 'therapist',
  status             user_status not null default 'active',
  full_name          text not null,
  phone              text not null unique,
  email              text not null unique,
  national_id        text,
  profession         text,
  business_number    text,
  door_code          text,
  terms_accepted_at  timestamptz,
  terms_version      text,
  payplus_token_uid  text,
  card_last4         text,
  card_expiry        text,
  admin_notes        text,
  ics_token          uuid default gen_random_uuid(),
  created_at         timestamptz default now()
);

-- ═══ כרטיסיות ═══
create table punch_card_tiers (
  id              uuid primary key default gen_random_uuid(),
  hours           int not null unique,
  price_per_hour  numeric(10,2) not null,
  deposit_hours   int not null default 2,
  active          boolean default true,
  sort_order      int default 0
);

create table punch_cards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete restrict,
  tier_id           uuid references punch_card_tiers(id),
  hours_purchased   numeric(5,2) not null,
  hours_remaining   numeric(5,2) not null,
  price_per_hour    numeric(10,2) not null,
  deposit_amount    numeric(10,2) not null,
  deposit_remaining numeric(10,2) not null,
  purchased_at      timestamptz default now(),
  expires_at        timestamptz not null,
  active            boolean default true,
  constraint hours_non_negative   check (hours_remaining >= 0),
  constraint deposit_non_negative check (deposit_remaining >= 0)
);
create index on punch_cards (user_id, active, expires_at);

-- ═══ ססיות ═══
create table session_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references profiles(id) on delete restrict,
  status               sub_status not null default 'requested',
  weekly_hours         numeric(4,2) not null check (weekly_hours >= 5),
  monthly_price        numeric(10,2) not null,
  hold_expires_at      timestamptz,
  requested_at         timestamptz default now(),
  reviewed_by          uuid references profiles(id),
  reviewed_at          timestamptz,
  rejection_reason     text,
  start_date           date,
  next_billing_date    date,
  cancel_requested_at  timestamptz,
  effective_end_date   date,
  created_at           timestamptz default now()
);

create table session_slots (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references session_subscriptions(id) on delete cascade,
  room_id          uuid not null references rooms(id) on delete restrict,
  weekday          int not null check (weekday between 0 and 6),
  start_time       time not null,
  end_time         time not null,
  check (end_time > start_time)
);
create index on session_slots (room_id, weekday);

-- ═══ הזמנות ═══
create table bookings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete restrict,
  room_id          uuid not null references rooms(id) on delete restrict,
  source           booking_source not null,
  punch_card_id    uuid references punch_cards(id),
  subscription_id  uuid references session_subscriptions(id),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  hours_charged    numeric(4,2) not null,
  status           booking_status not null default 'confirmed',
  cancelled_at     timestamptz,
  cancelled_by     uuid references profiles(id),
  hours_refunded   boolean default false,
  admin_note       text,
  created_at       timestamptz default now(),
  check (ends_at > starts_at)
);

-- 🔴 מניעת חפיפה ברמת ה-DB (לא ברמת האפליקציה!)
alter table bookings add constraint no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed');

create index on bookings (user_id, starts_at desc);
create index on bookings (room_id, starts_at);

-- ═══ חסימות תחזוקה ═══
create table room_blocks (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text not null,
  created_by  uuid references profiles(id),
  created_at  timestamptz default now(),
  check (ends_at > starts_at)
);
alter table room_blocks add constraint block_no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  );

-- ═══ תשלומים ═══
create table payments (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references profiles(id) on delete restrict,
  type                   payment_type not null,
  status                 payment_status not null default 'pending',
  method                 payment_method,
  amount_before_vat      numeric(10,2) not null,
  vat_amount             numeric(10,2) not null,
  amount_total           numeric(10,2) not null,
  payplus_page_uid       text,
  payplus_transaction_uid text unique,
  invoice_url            text,
  punch_card_id          uuid references punch_cards(id),
  subscription_id        uuid references session_subscriptions(id),
  failure_reason         text,
  retry_count            int default 0,
  created_at             timestamptz default now(),
  paid_at                timestamptz
);
create index on payments (user_id, created_at desc);

-- ═══ חריגות ═══
create table overrun_charges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete restrict,
  booking_id     uuid references bookings(id),
  minutes        int not null,
  hours_charged  numeric(4,2) not null,
  amount         numeric(10,2) not null,
  source         overrun_source not null,
  payment_id     uuid references payments(id),
  note           text,
  recorded_by    uuid not null references profiles(id),
  created_at     timestamptz default now()
);

-- ═══ רשימת המתנה ═══
create table waitlist (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  branch_id    uuid references branches(id),
  room_id      uuid references rooms(id),
  date         date not null,
  start_time   time not null,
  end_time     time not null,
  notified_at  timestamptz,
  fulfilled    boolean default false,
  created_at   timestamptz default now()
);

-- ═══ יומן ביקורת ═══
create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references profiles(id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz default now()
);

-- ═══ View לזמינות ציבורית (🔒 קריטי לפרטיות — ר' §5.3) ═══
-- אין user_id. אין source. אין שום דבר שמזהה מטפל.
create view public_availability as
select
  b.room_id,
  b.starts_at,
  b.ends_at,
  'booked'::text as kind
from bookings b
where b.status = 'confirmed' and b.starts_at > now() - interval '1 day'
union all
select rb.room_id, rb.starts_at, rb.ends_at, 'blocked'
from room_blocks rb
where rb.ends_at > now() - interval '1 day';
