# בקליניקה — מסמך אפיון מלא
### מערכת ניהול השכרת קליניקות | גרסה 1.0

---

## 1. תקציר מנהלים

### 1.1 הבעיה
כיום "בקליניקה" מפעילה **שתי מערכות מנותקות**:
- **Skedda** (`baclinica.skedda.com`) — הזמנת חדרים
- **WooCommerce + PayPlus** (`baclinica.co.il`) — תשלומים

אין ביניהן שום קשר. אף מנגנון לא מוודא שמי שמזמין חדר באמת שילם, אין מעקב אוטומטי על יתרת שעות, אין אכיפה של מדיניות ביטולים, ואין ניהול של ססיות מתחדשות. הכל מתנהל ידנית מול ~300 מטפלים.

### 1.2 הפתרון
מערכת אחת שבה **תשלום והזמנה הם אותו זרם**. מטפל לא יכול לגעת בלוח הזמנים לפני שיש לו יתרת שעות בתוקף. המערכת מנהלת יתרות, ביטולים, חידושי מנוי וחיובי חריגה אוטומטית.

### 1.3 היקף
| פרמטר | ערך |
|---|---|
| משתמשי קצה | ~300 מטפלים |
| סניפים | 2 (הוד השרון, נווה ימין) — **ניתן להוספה ע"י אדמין** |
| חדרים | 10 — **ניתן להוספה ע"י אדמין** |
| שעות פעילות | 24/7, כולל שבתות וחגים |
| שפה | עברית בלבד, RTL |
| מטבע | ₪, מע"מ 18% מוצג בנפרד |

### 1.4 מה זה **לא**
- ❌ לא אפליקציה בחנויות (App Store / Play) — **PWA בלבד**
- ❌ לא מנהל את המטופלים של המטפל
- ❌ לא כולל צ'אט פנימי
- ❌ לא כולל SMS (מלבד OTP)
- ❌ לא מחליף את אתר השיווק `baclinica.co.il`

---

## 2. ארכיטקטורה

### 2.1 סטאק
| שכבה | טכנולוגיה | נימוק |
|---|---|---|
| Frontend | **Next.js 15** (App Router) + TypeScript | SSR, API routes, PWA |
| UI | Tailwind CSS + shadcn/ui | RTL native |
| DB + Auth | **Supabase** (PostgreSQL 15) | RLS, Realtime, Auth מובנה |
| Hosting | **Vercel** | דיפלוי אוטומטי מ-Git |
| Cron | Vercel Cron | חידושי ססיות, materialization, תזכורות |
| תשלומים | **WooCommerce** (`baclinica.co.il`) | חנות קיימת, בלי אינטגרציית gateway ישירה |
| מיילים | **Resend** | דומיין מאומת |
| OTP | Supabase Auth + ספק SMS ישראלי | אימות טלפון |

### 2.2 דומיינים
```
baclinica.co.il          → אתר שיווק קיים (WordPress) — לא נוגעים
app.baclinica.co.il      → PWA למטפלים
admin.baclinica.co.il    → פאנל ניהול (דסקטופ)
```

שני האפליקציות באותו פרויקט Next.js, מופרדות ב-route groups: `(app)` ו-`(admin)`, עם middleware שבודק role.

### 2.3 מערכות שיוצאות משימוש
- **Skedda** — מבוטל בסיום M4
- **WooCommerce checkout** — מבוטל בסיום M5. מוצרי המחירון באתר יופנו ל-`app.baclinica.co.il`

---

## 3. מודל עסקי — הכללים המלאים

### 3.1 כרטיסייה (Punch Card)

⚠️ **הפיקדון כרגע כבוי** — `deposit_hours=0` בכל המדרגות (`punch_card_tiers`),
כרטיסיות חדשות לא גובות פיקדון. המנגנון (הטבלה למטה, admin_complete_deposit,
`DEPOSIT_DEPLETED`) נשאר במערכת ומופעל אוטומטית אם `deposit_hours` יעודכן
בעתיד; כרטיסיות שכבר שילמו פיקדון (לפני הכיבוי) ממשיכות לאכוף אותו כרגיל.

מדרגות תמחור (**לפני מע"מ**):

| שעות | ₪/שעה | סה"כ | פיקדון (2 ש') | לתשלום |
|---|---|---|---|---|
| 10 | 55 | 550 | 110 | **660** |
| 20 | 50 | 1,000 | 100 | **1,100** |
| 30 | 45 | 1,350 | 90 | **1,440** |
| 40 | 40 | 1,600 | 80 | **1,680** |
| 50 | 35 | 1,750 | 70 | **1,820** |

**כללים:**
- תוקף: **24 חודשים** מיום הרכישה
- אישית, לא ניתנת להעברה
- מימוש בכל חדר ובכל שעה פנויה
- **פיקדון = 2 שעות לפי תעריף המדרגה**, משולם מראש יחד עם הכרטיסייה
- ניתן להחזיק כמה כרטיסיות במקביל — **מימוש לפי FIFO** (הישנה ביותר קודם)
- ניתן לרכוש כרטיסייה גם למי שמחזיק ססיה

**הפיקדון:**
- משמש **רק** לכיסוי חיובי חריגה שהאדמין רושמת
- ירד הפיקדון מתחת ל-100% → **המטפל חסום מהזמנות חדשות** עד שישלים
- כרטיסייה נגמרה/פגה + פיקדון שלם → נשאר כקרדיט לכרטיסייה הבאה, או מוחזר לבקשת המטפל

### 3.2 ססיה (Session — מנוי חודשי)

**מוצר בהיקף קבוע — לא תמחור שולי לפי שעות.**

| שעות שבועיות | ₪/חודש (לפני מע"מ) |
|---|---|
| 5 (קבוע, `session_base_hours`) | **600** (`session_base_price`) |

> `weekly_hours` חייב להיות שווה בדיוק ל-`session_base_hours` (ב-`app_settings`, ברירת מחדל 5) —
> לא פחות ולא יותר. `monthly_price = session_base_price` תמיד. שינוי היקף הססיה
> הקבוע לכלל המערכת נעשה דרך `app_settings` בלבד, לא דרך תמחור לפי שעה.

**כללים:**
- היקף קבוע — בדיוק `session_base_hours` שעות שבועיות (לא ניתן לבחור יותר או פחות)
- ניתן לפרוס על **כמה ימים וכמה חדרים** (למשל: ג' 09:00–12:00 בחדר 3 + ה' 14:00–16:00 בחדר 5)
- המשבצת **נעולה לצמיתות** — חוזרת כל שבוע
- 🔴 **מטפל בססיה לא יכול לשחרר מפגש בודד.** לא הגיע — השעה אבודה, החדר נשאר חסום על שמו. אין החזר, אין זיכוי, אין שחרור לאחרים.
- ביטול מפגש בודד אפשרי **רק ע"י אדמין** (חריג ידני)
- **ביטול המנוי: חודש מראש.** אחרת מתחדש אוטומטית
- מתחדש עד לבקשת ביטול מפורשת

### 3.3 🔴 זרימת אישור ססיה (קריטי)

```
[מטפל] בוחר משבצות פנויות בלוח
   ↓
[מערכת] נועלת אותן זמנית (hold, 72 שעות) ← אף אחד אחר לא יכול להזמין
   ↓
[מערכת] יוצרת בקשה במצב  requested
   ↓  מייל לאדמין
[אדמין] בודקת זמינות ארוכת טווח, מאשרת או דוחה
   ↓
   ├── דחייה → rejected → ה-hold משתחרר → מייל למטפל
   └── אישור → awaiting_payment → מייל למטפל עם קישור תשלום (תוקף 72 שעות)
          ↓
       [מטפל] משלם + שומר כרטיס (טוקן)
          ↓
       ✅ active → המשבצות ננעלות לצמיתות + materialization ל-90 יום קדימה
          ↓
       לא שילם תוך 72 שעות → expired → ה-hold משתחרר
```

**אין תשלום לפני אישור אדמין. נקודה.**

### 3.4 ביטולים

| סוג | חלון | מעבר לחלון | בתוך החלון |
|---|---|---|---|
| **הזמנת כרטיסייה** | 24 שעות | שעות חוזרות ליתרה | שעות נשרפות |
| **מפגש ססיה בודד** | — | ❌ לא ניתן לביטול ע"י מטפל | — |
| **מנוי ססיה (כולו)** | 30 יום | פעיל עד סוף התקופה ששולמה | — |

*מקור: הסכם השירותים החתום + החלטת לקוח.*

### 3.5 חריגות (Overrun)

**המערכת לא מזהה חריגות אוטומטית.** האדמין מזהה דרך מצלמות האבטחה ורושמת ידנית.

```
[אדמין] פאנל → "רישום חריגה" → בוחרת הזמנה + דקות חריגה + הערה
   ↓
[מערכת] מעגלת למעלה לחצי שעה הקרובה
   ↓
   ├── יש פיקדון מספיק  → ניכוי מהפיקדון + מייל למטפל
   └── אין פיקדון מספיק → חיוב אוטומטי בכרטיס השמור
                          ├── הצליח → מייל
                          └── נכשל  → חסימת הזמנות + מייל
```

### 3.6 חלונות זמן (Slots) — 🔴 הכי חשוב

**המטפל מזמין "09:00–10:00". הכניסה בפועל 08:55, הפינוי 09:55.**

```
תצוגה למטפל:     09:00 ─────────────────── 10:00
כניסה בפועל:  08:55 ─────────────────── 09:55  ┐
המטפל הבא:                          09:55 ──────┘ 10:55
                                    └─ 5 דק' חפיפה לחילופין
```

**מימוש טכני:** ה-DB שומר `starts_at` / `ends_at` בערכים העגולים. שדות `access_start` / `access_end` הם עמודות מחושבות (`starts_at − 5min`). בדיקת החפיפה רצה על `[starts_at, ends_at)` — כלומר **09:00–10:00 ו-10:00–11:00 לא מתנגשים**. חמש דקות ההתארגנות והקיפול הן חלק מהשעה שנרכשה, ומוצגות בכרטיס ההזמנה ובמייל האישור.

### 3.7 חוקי הזמנה

| כלל | ערך |
|---|---|
| יחידת זמן | בלוקים של **30 דקות** |
| משך מינימלי | 30 דקות |
| משך מקסימלי | 8 שעות ברצף |
| טווח קדימה | עד **30 יום** |
| הזמנה מיידית | ✅ מותר, גם לשעה הקרובה |
| שעות פעילות | 24/7 |
| חפיפה עצמית | ❌ מטפל לא יכול להזמין שני חדרים באותה שעה |
| ללא יתרה | ❌ חסום לחלוטין |
| פיקדון חסר | ❌ חסום עד השלמה |

### 3.8 פרטיות בלוח

| רואה | מטפל | אדמין |
|---|---|---|
| ההזמנות שלו | ✅ מלא | ✅ |
| הזמנות אחרים | 🔒 "תפוס" בלבד — ללא שם, ללא סוג | ✅ שם + פרטים |
| חסימות תחזוקה | 🔒 "לא זמין" | ✅ + סיבה |

---

## 4. מסע לקוח

```
1. מטפל פונה למנהלת (טלפון / וואטסאפ / טופס באתר)
2. שיחת היכרות — סינון ידני, מחוץ למערכת
3. המנהלת שולחת קישור:  app.baclinica.co.il
4. הרשמה עצמאית — טלפון + OTP + פרטים + חתימה על התקנון
5. גישה מיידית ללוח הזמנים (צפייה בלבד)
6. רכישה:
   ├── כרטיסייה → תשלום מיידי → יתרה זמינה
   └── ססיה     → בחירה → אישור אדמין → תשלום → נעילה
7. שיבוץ עצמאי לפי זמינות
8. קוד דלת אישי מוצג בפרופיל
```

> **הערה:** אין אישור ידני של הרשמה. מי שקיבל את הקישור נכנס. הסינון קרה בשיחה.

---

## 5. סכמת בסיס הנתונים

### 5.1 ENUMs

```sql
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
```

### 5.2 טבלאות

```sql
-- ═══ הגדרות מערכת ═══
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz default now()
);
-- vat_rate: 0.18
-- buffer_minutes: 5
-- booking_horizon_days: 30
-- cancel_window_hours: 24
-- sub_cancel_notice_days: 30
-- session_base_price: 600 | session_base_hours: 5 (היקף ססיה קבוע, לא מינימום)
-- session_hold_hours: 72

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
  room_type    room_type[] not null default array['talk']::room_type[],
    -- מערך, לא ערך יחיד: חדר יכול לשרת יותר מסוג טיפול אחד (למשל חדר עם
    -- מיטת טיפולים שגם מתאים לשיח) — ר' migration 20260828000011.
  capacity     int default 2,
  description  text,
  equipment    jsonb default '[]'::jsonb,  -- ["מיטת טיפולים","כיור","פרגוד","לוח מחיק","מזגן נפרד"]
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
  door_code          text,               -- מוזן ע"י אדמין בלבד
  terms_accepted_at  timestamptz,
  terms_version      text,
  payplus_token_uid  text,               -- כרטיס שמור
  card_last4         text,
  card_expiry        text,
  admin_notes        text,               -- לא נחשף למטפל
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
  expires_at        timestamptz not null,  -- purchased_at + 24 months
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
  weekday          int not null check (weekday between 0 and 6),  -- 0 = ראשון
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
create extension if not exists btree_gist;
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
```

### 5.3 View לזמינות ציבורית (🔒 קריטי לפרטיות)

```sql
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
```

**אין `user_id` ב-view הזה. אין `source`. אין שום דבר שמזהה מטפל.** זו הדרך היחידה שמטפל מקבל מידע על תפוסה.

### 5.4 Row Level Security

```sql
alter table profiles              enable row level security;
alter table bookings              enable row level security;
alter table punch_cards           enable row level security;
alter table session_subscriptions enable row level security;
alter table payments              enable row level security;
alter table overrun_charges       enable row level security;

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer stable;

-- פרופיל: רואה רק את עצמו (בלי admin_notes — נחשף ב-view נפרד)
create policy own_profile on profiles for select using (id = auth.uid() or is_admin());
create policy edit_profile on profiles for update using (id = auth.uid() or is_admin());

-- הזמנות: רואה רק את שלו. אחרים — דרך public_availability בלבד
create policy own_bookings on bookings for select using (user_id = auth.uid() or is_admin());

-- יצירה ועדכון: אך ורק דרך RPC (SECURITY DEFINER). אין INSERT ישיר.
create policy no_direct_insert on bookings for insert with check (is_admin());

create policy own_cards   on punch_cards           for select using (user_id = auth.uid() or is_admin());
create policy own_subs    on session_subscriptions for select using (user_id = auth.uid() or is_admin());
create policy own_pays    on payments              for select using (user_id = auth.uid() or is_admin());
create policy own_over    on overrun_charges       for select using (user_id = auth.uid() or is_admin());

-- טבלאות ציבוריות לקריאה
alter table branches enable row level security;
alter table rooms    enable row level security;
create policy read_branches on branches for select using (active or is_admin());
create policy read_rooms    on rooms    for select using (active or is_admin());
```

---

## 6. לוגיקה עסקית — פונקציות DB

> 🔴 **כל שינוי במצב ההזמנות עובר דרך פונקציות `SECURITY DEFINER` בתוך טרנזקציה.** אסור לאפליקציה לכתוב ישירות ל-`bookings` או `punch_cards`. זה מונע race conditions כשכמה מטפלים לוחצים על אותה משבצת בו-זמנית.

### 6.1 `create_booking(room_id, starts_at, ends_at)`

```
BEGIN TRANSACTION

1.  ולידציות זמן:
    - starts_at % 30min = 0  ומשך  ≥ 30min  ומשך ≤ 8h
    - starts_at > now() - 30 יום  (אחרת TOO_FAR_PAST) — מאפשר גם התחלה
      בעבר (הארכה באותו רגע / רישום רטרואקטיבי), ר' CLAUDE.md
      "הזמנה רטרואקטיבית". starts_at ≤ now() אינו נבדק יותר.
    - starts_at ≤ now() + booking_horizon_days
2.  ולידציית משתמש:
    - status = 'active'  (אחרת: USER_SUSPENDED)
3.  אין חפיפה עצמית של המשתמש באותו טווח  (SELF_OVERLAP)
4.  החדר קיים ופעיל, ואין room_block חופף  (ROOM_UNAVAILABLE)
5.  בחירת כרטיסייה — FIFO:
      SELECT * FROM punch_cards
      WHERE user_id = auth.uid() AND active
        AND expires_at > ends_at
        AND hours_remaining >= :hours
        AND deposit_remaining = deposit_amount   ← 🔴 פיקדון שלם
      ORDER BY expires_at ASC
      LIMIT 1
      FOR UPDATE                                  ← 🔴 נעילת שורה
    לא נמצא → NO_CREDIT / DEPOSIT_DEPLETED
6.  UPDATE punch_cards SET hours_remaining = hours_remaining - :hours
7.  INSERT INTO bookings (...)
      → ה-EXCLUDE constraint יזרוק  ROOM_TAKEN  אם מישהו הקדים
8.  INSERT INTO audit_log
9.  שליחת מייל אישור (אסינכרוני, מחוץ לטרנזקציה)

COMMIT
```

### 6.2 `cancel_booking(booking_id)`

```
1.  ההזמנה שייכת למשתמש, סטטוס = confirmed
2.  🔴 source = 'session'  →  SESSION_NOT_CANCELLABLE
3.  starts_at > now()      →  אחרת BOOKING_PASSED
4.  hours_before = (starts_at - now()) / 3600
5.  IF hours_before >= 24:
        UPDATE punch_cards SET hours_remaining += hours_charged
        hours_refunded = true
    ELSE:
        hours_refunded = false          ← השעות נשרפות
6.  status = 'cancelled_by_user'
7.  מייל אישור ביטול (מציין אם זוכה או לא)
```

### 6.3 `request_session(slots[], start_date?)`

```
1.  weekly_hours = Σ משך כל המשבצות; חייב להיות שווה בדיוק ל-session_base_hours אחרת SESSION_HOURS_FIXED
2.  🔴 אין בדיקת זמינות משבצות בשלב הזה (ר' הערה למטה) — הבקשה תמיד עוברת לאדמין
3.  start_date אופציונלי (ברירת מחדל: היום); < היום → INVALID_START_DATE
4.  monthly_price = session_base_price (קבוע)
5.  INSERT session_subscriptions (status='requested', start_date, hold_expires_at = now()+72h)
6.  INSERT session_slots
7.  מייל לאדמין
```

> **למה בלי בדיקת זמינות בשלב הבקשה:** אם המשבצת המבוקשת תפוסה, המטפל/ת לא
> אמור/ה לגלות "מישהו אחר כבר סגר את המשבצת הזו" — זה חושף מידע על מטפל/ת
> אחר/ת (🔴 חוק ברזל #3). הבקשה תמיד נשלחת לאדמין; אם יש התנגשות אמיתית,
> `approve_session` הרגיל ייחסם (ר' 6.4) והאדמין פותר דרך `admin_create_session`
> (ר' 6.4.1) בבחירת חדר/יום/שעה חלופיים.

### 6.4 `approve_session(subscription_id)` — אדמין בלבד

```
1.  is_admin()  אחרת FORBIDDEN
2.  status = 'requested'
3.  בדיקה חוזרת שהמשבצות עדיין פנויות — 🔴 נשאר ללא שינוי, לא מדלגים על זה כאן
4.  status = 'awaiting_payment', hold_expires_at = now() + 72h
5.  יצירת בקשת תשלום ממתינה (create_session_initial_payment) + קישור לדף המוצר בחנות ה-Woo
6.  מייל למטפל עם הקישור
```

### 6.4.1 `admin_create_session(user_id, slots[], start_date?)` — אדמין בלבד, קביעה חופשית

```
1.  is_admin()  אחרת FORBIDDEN; המטפל/ת חייב/ת status='active'
2.  weekly_hours = Σ משך כל המשבצות; חייב session_base_hours בדיוק (SESSION_HOURS_FIXED)
3.  🔴 בלי שום בדיקת התנגשות — קביעה חופשית לגמרי (כל חדר/יום/שעה)
4.  start_date אופציונלי (ברירת מחדל: היום)
5.  INSERT session_subscriptions ישירות ב-status='awaiting_payment' — מדלג
    על 'requested' (הקביעה ע"י אדמין היא עצמה האישור)
6.  🔴 התשלום עצמו לא מדולג: אותו מסלול בדיוק (create_session_initial_payment
    + חנות ה-Woo) — חוק ברזל #5 עדיין בתוקף, רק שלב 'requested' מדולג
7.  audit_log: session_created_by_admin
8.  מייל למטפל עם קישור תשלום (זהה ל-6.4 שלב 5–6)
```

### 6.5 `activate_session_payment(payment_id, ...)` — מ-webhook תשלום (Woo)

```
1.  status = 'active'
2.  start_date = coalesce(start_date, היום) — לא דורס אם כבר נקבע בבקשה
3.  next_billing_date = start_date + 1 חודש
4.  materialize_session_bookings(subscription_id, 90 days)
```

### 6.6 `materialize_session_bookings()` — cron יומי

יוצר רשומות `bookings` אמיתיות מהמשבצות החוזרות, ברולינג של 90 יום קדימה. זה מה שגורם לססיות להופיע בלוח ולחסום אחרים.

```
עבור כל subscription במצב active או pending_cancellation:
  עבור כל slot:
    עבור כל מופע ב-90 הימים הקרובים:
      אם start_date קיים ומועד המופע לפניו → דלג
      אם effective_end_date קיים ומועד המופע אחריו → דלג
      אם כבר קיימת הזמנה → דלג
      INSERT bookings (source='session', hours_charged=0)
      אם EXCLUDE constraint נכשל → 🚨 CONFLICT_ALERT לאדמין
```

### 6.7 חידוש ססיה — יזום ע"י המטפל/ת, לא cron

אין חיוב אוטומטי (אין טוקן כרטיס שמור). 7 ימים לפני `next_billing_date` נשלחת
תזכורת מייל (למטפל/ת ולהנהלה, cron `send-reminders`). המטפל/ת לוחצ/ת "חידוש
מנוי" → `initiate_session_renewal_payment` → הפניה לחנות ה-Woo → webhook
מאשר תשלום → `finalize_session_renewal` (`next_billing_date += 1 month`,
מייל קבלה). מנוי `active` שלא חודש עד `next_billing_date` → `expired`
אוטומטית (cron שעתי) — לא נחסמות הזמנות קיימות, רק לא נוצרות חדשות.

### 6.8 `record_overrun(booking_id, minutes, note)` — אדמין בלבד

```
1.  hours = ceil(minutes / 30) / 2          -- עיגול לחצי שעה
2.  amount = hours × price_per_hour של הכרטיסייה הרלוונטית
3.  IF deposit_remaining >= amount:
        deposit_remaining -= amount
        source = 'deposit'
        🔴 profiles → חסימת הזמנות חדשות עד השלמת פיקדון
    ELSE:
        יצירת payment ממתין (type='overrun') — אין טוקן כרטיס שמור,
        סימון כשולם נעשה ידנית ע"י אדמין (/admin/payments)
        source = 'charge'
4.  INSERT overrun_charges
5.  מייל למטפל עם פירוט
```

---

## 7. אינטגרציית WooCommerce (תשלומים)

כל תשלום — כרטיסייה וססיה כאחד — מתבצע בחנות ה-Woo (`baclinica.co.il`), לא
ב-Cleana. Cleana לא יוצרת דפי תשלום ולא מדברת עם שום gateway ישירות; היא רק
מפנה את המטפל/ת למוצר הנכון בחנות. (הוחלט לזנוח אינטגרציית PayPlus ישירה —
מעולם לא חוברה בפועל, ר' היסטוריית הפרויקט.)

**גילוי תשלום — שני מסלולים אפשריים, אותה לוגיקה בדיוק** (`processWooOrder`,
`lib/woo/process-order.ts`):
- **Webhook** (push מ-Woo) — כשמוגדר webhook בחנות. מיידי, מאומת בחתימת HMAC.
- **Polling** (pull דרך REST API) — המצב הנוכחי, כי אין webhook מוגדר בחנות.
  `lib/woo/poll.ts` שולף הזמנות אחרונות ומריץ אותן דרך אותה `processWooOrder`.
  שתי נקודות הפעלה: בדיקה יזומה בכל טעינת עמוד מחובר (חלון 90 דק', ר'
  `app/(app)/layout.tsx`), ו-cron יומי כרשת ביטחון (חלון 26 שעות, ר'
  `app/api/cron/poll-woo-orders`).

### 7.1 משתני סביבה

```env
NEXT_PUBLIC_WOOCOMMERCE_STORE_URL=https://baclinica.co.il
WOOCOMMERCE_WEBHOOK_SECRET=      # אופציונלי — רק אם מוגדר webhook בחנות
WOOCOMMERCE_KEY=                 # REST API, הרשאת Read בלבד
WOOCOMMERCE_SECRET=              # REST API, הרשאת Read בלבד
```

### 7.2 מיפוי מוצרים

| מוצר | איפה ממופה |
|---|---|
| כרטיסייה (5 מדרגות) | טבלת `woo_product_tiers` (woo_product_id → tier_id), אדמין בלבד |
| ססיה (מוצר קבוע, מחיר קבוע) | `app_settings.woo_session_product_id`, נערך ב-`/admin/settings` |

### 7.3 זרימה

```
1. Cleana יוצרת בקשת תשלום ממתינה (payments, status='pending') — כדי שלמסלול
   סימון-מזומן הידני יהיה מה לסמן, גם אם התשלום המקוון לא הושלם
2. הפניית המטפל/ת ל-add-to-cart של המוצר המתאים בחנות (redirect חיצוני מלא)
3. תשלום מתבצע בחנות עצמה — Cleana לא מעורבת
4. גילוי שההזמנה שולמה — או webhook (push, אם מוגדר) או polling (pull, ר'
   למעלה) — שניהם מזינים את אותה processWooOrder
5. אם webhook: אימות חתימת HMAC מול WOOCOMMERCE_WEBHOOK_SECRET   ← 🔴 חובה
   אם polling: הקריאה ל-Woo REST API מאומתת ב-Consumer Key/Secret משלנו —
   אנחנו זה שיוזם את הקריאה, לא סומכים על payload נכנס לא-מאומת
6. התאמה לפי טלפון/מייל (פרופיל קיים) → תשלום pending מתאים → הפעלה
```

כרטיסייה שנרכשה **לפני** שיש חשבון Cleana (למשל דרך פרסום/שיווק) עוברת
נתיב מעט שונה: אין פרופיל קיים להתאים אליו, אז ה-webhook שומר "רכישה
ממתינה" (`woo_pending_purchases`) לפי טלפון/מייל, ומופעלת אוטומטית
בהרשמה/כניסה הבאה (`claim_woo_pending_purchase`). ססיה תמיד מניחה פרופיל
קיים (יש בקשה מאושרת מראש), כך שההפעלה שם מיידית.

### 7.4 כללי ברזל

- 🔴 **מקור האמת הוא ההזמנה עצמה ב-Woo**, לא ה-redirect. משתמש שסגר את הדפדפן — התשלום עדיין תקף, יתגלה ב-polling הבא.
- 🔴 **אידמפוטנטיות**: `payplus_transaction_uid` (שם השדה נשאר, מכיל גם אסמכתאות Woo) הוא `UNIQUE`. אותה הזמנה שמתגלה כמה פעמים = פעולה אחת.
- 🔴 **תמיד לאמת** — חתימת HMAC ב-webhook, או Consumer Key/Secret משלנו ב-polling — לפני עדכון סטטוס.
- כל התשלומים כוללים **מע"מ 18%** מוצג בנפרד.

---

## 8. מסכים — ממשק מטפל (PWA)

### 8.1 הרשמה
| מסך | תוכן |
|---|---|
| טלפון | שדה טלפון → שליחת OTP |
| OTP | 6 ספרות |
| פרטים | שם מלא\*, מייל\*, ת"ז, תחום טיפול\*, מספר עוסק/ח.פ |
| תקנון | הצגת הסכם השירותים המלא + checkbox + חתימה → `terms_accepted_at` |

### 8.2 בית
- כרטיס יתרה: שעות נותרות, תוקף, מצב פיקדון
- ההזמנה הבאה (עם **שעת הכניסה בפועל** וקוד הדלת)
- 3 ההזמנות הקרובות
- CTA: "הזמנת חדר"
- באנר אזהרה: כרטיסייה נגמרת / פיקדון חסר / חיוב נכשל

### 8.3 לוח זמנים ⭐ הלב
- בורר סניף (הוד השרון / נווה ימין)
- תצוגת **יום** — עמודה לכל חדר, ציר שעות אנכי (מובייל: גלילה אופקית)
- תצוגת **שבוע** — לחדר בודד
- מקרא: 🟢 פנוי · ⚪ תפוס · 🔵 ההזמנה שלי · ⚫ לא זמין
- סינון לפי סוג חדר / ציוד
- Realtime — משבצת שנתפסת נעלמת מיד
- לחיצה על משבצת פנויה → מודל הזמנה

### 8.4 מודל הזמנה
```
חדר 3 · הוד השרון
יום שלישי, 3 בספטמבר
09:00 – 10:00

🔑 כניסה בפועל: 08:55  ·  פינוי: 09:55

עלות: שעה אחת
יתרה אחרי ההזמנה: 17 שעות

[ אישור ]  [ ביטול ]
```

### 8.5 ההזמנות שלי
- קרובות / היסטוריה
- כל כרטיס: חדר, סניף, תאריך, שעות (עגולות + בפועל), מקור (כרטיסייה/ססיה)
- כפתור ביטול — **רק לכרטיסייה**, עם אזהרה ברורה אם מתחת ל-24 שעות
- ססיה: תג "ססיה קבועה — לביטול פנו להנהלה"

### 8.6 רכישה
**כרטיסייה** — 5 כרטיסים עם המדרגות, פירוט מלא (מחיר + פיקדון + מע"מ) → הפניה לחנות ה-Woo

**ססיה** — אשף 3 שלבים:
1. בחירת משבצות בלוח (עם מונה שעות שבועיות ומחיר חי)
2. סיכום + הסבר מפורש: *"לאחר האישור לא ניתן לשחרר מפגשים בודדים. ביטול המנוי — 30 יום מראש."*
3. שליחת בקשה → מסך המתנה לאישור

### 8.7 החשבון שלי
- **סקירה**: שעות שנוצלו / נותרו, גרף שימוש חודשי, סה"כ הוצאה
- **כרטיסיות**: כל אחת עם יתרה, תוקף ומצב פיקדון
- **ססיה**: משבצות, מחיר חודשי, חיוב הבא, כפתור "בקשת ביטול" (עם הסבר 30 יום)
- **תשלומים**: היסטוריה + קישורי חשבוניות
- **חריגות**: פירוט כל חיוב חריגה
- **פרטים אישיים** + 🔑 **קוד דלת**
- ~~אמצעי תשלום: 4 ספרות אחרונות, החלפת כרטיס~~ — לא רלוונטי יותר; פרטי הכרטיס נשארים אצל Woo, לא אצלנו
- **סנכרון יומן**: קישור ICS אישי + הוראות לגוגל/אפל

---

## 9. מסכים — פאנל אדמין

| מסך | יכולות |
|---|---|
| **דשבורד** | תפוסה היום, הכנסות החודש, בקשות ססיה ממתינות 🔔, התראות (חיובים שנכשלו, כרטיסיות שפגות) |
| **לוח מלא** | כל החדרים, **עם שמות מטפלים**. שיבוץ ידני, ביטול, גרירה, חסימת תחזוקה |
| **מטפלים** | טבלה + חיפוש. כרטיס לקוח: פרטים, יתרות, היסטוריה, קוד דלת, הערות פנימיות. פעולות: השעיה, שעות מתנה, השלמת פיקדון, עריכה, איפוס סיסמה |
| **בקשות ססיה** | תור. תצוגת המשבצות המבוקשות על הלוח → **אישור / דחייה + סיבה** |
| **ססיות פעילות** | רשימה, מחיר, חיוב הבא, עצירה/ביטול, שינוי משבצות |
| **חריגות** | ➕ רישום חריגה: בחירת הזמנה → דקות → הערה → תצוגה מקדימה של החיוב → אישור |
| **תשלומים** | כל העסקאות, סינון, סימון ידני כשולם (מזומן) |
| **סניפים וחדרים** | CRUD מלא: הוספת סניף, הוספת חדר, סוג, ציוד, תמונות, הפעלה/כיבוי |
| **הגדרות** | מחירון כרטיסיות, תמחור ססיה, חלונות ביטול, buffer, מע"מ, גרסת תקנון |
| **דוחות** (מינימלי) | הכנסות חודשיות · תפוסה לפי חדר · יתרות פתוחות · מטפלים לא פעילים 60 יום. הכל עם ייצוא CSV |

**הרשאות:** חשבון אדמין אחד משותף לשני גורמים. כל פעולה נרשמת ב-`audit_log`.

---

## 10. התראות (מייל בלבד)

| טריגר | נמען |
|---|---|
| אישור הזמנה (+ קובץ ICS + שעת כניסה בפועל) | מטפל |
| תזכורת 24 שעות לפני | מטפל |
| ביטול הזמנה (מציין אם זוכה) | מטפל |
| רכישת כרטיסייה + חשבונית | מטפל |
| יתרה ≤ 2 שעות | מטפל |
| כרטיסייה פגה בעוד 30 יום | מטפל |
| **בקשת ססיה חדשה** | 🔔 אדמין |
| אישור ססיה + קישור תשלום | מטפל |
| דחיית ססיה + סיבה | מטפל |
| חידוש ססיה + חשבונית | מטפל |
| חיוב נכשל | מטפל + אדמין |
| רישום חריגה | מטפל |
| פיקדון ירד — נדרשת השלמה | מטפל |
| התנגשות ב-materialization | 🚨 אדמין |

---

## 11. תוכנית עבודה

| Milestone | תוכן | יעד |
|---|---|---|
| **M0** | Next.js + Supabase + Vercel, סכמה מלאה, RLS, seed (2 סניפים, 10 חדרים, 5 מדרגות) | יום 1 |
| **M1** | הרשמה: טלפון+OTP, פרטים, תקנון, פרופיל | יום 2 |
| **M2** | לוח זמנים: יום/שבוע, `public_availability`, Realtime, ניהול חדרים באדמין | ימים 3–4 |
| **M3** | PayPlus: דף תשלום, callback+hash, רכישת כרטיסייה, פיקדון, חשבוניות | ימים 5–6 |
| **M4** | מנוע הזמנות: `create_booking`, `cancel_booking`, ההזמנות שלי, EXCLUDE constraint | ימים 7–8 |
| **M5** | ססיות: בקשה → hold → אישור → תשלום+טוקן → materialization → cron חידוש | ימים 9–11 |
| **M6** | פאנל אדמין: מטפלים, לוח מלא, חריגות, דוחות, audit | ימים 12–14 |
| **M7** | מיילים, ICS, רשימת המתנה, cron תזכורות | יום 15 |
| **M8** | PWA (manifest, service worker, icons), RTL polish, מובייל, **בדיקות עומס** | ימים 16–17 |
| **M9** | UAT מול המנהלת, הזנת קודי דלת, הפניית האתר, כיבוי Skedda | ימים 18–20 |

> **MVP מינימלי לשבוע:** M0–M4. מטפל נרשם, קונה כרטיסייה, משבץ, מבטל. ססיות ידניות בינתיים.

---

## 12. משימות שלך (חוסמים)

| # | משימה | חוסם |
|---|---|---|
| 1 | מפתחות PayPlus API (`api_key`, `secret_key`, `payment_page_uid`) + Sandbox | M3 |
| 2 | ודא שביט ו-PayBox מופעלים בחשבון הסוחר | M3 |
| 3 | כתובת מדויקת של סניף נווה ימין | M0 |
| 4 | תמונות של 10 החדרים | M2 |
| 5 | קודי דלת אישיים לכל המטפלים הקיימים | M9 |
| 6 | דומיין: DNS ל-`app.` ו-`admin.` | M0 |
| 7 | חשבון Resend + אימות דומיין | M7 |
| 8 | ספק SMS ל-OTP | M1 |
| 9 | טקסט תקנון סופי (עם 24/48 שעות מאושרים) | M1 |

---

## 13. סיכונים

| סיכון | חומרה | מענה |
|---|---|---|
| Double-booking בו-זמני | 🔴 גבוה | EXCLUDE constraint ברמת DB — לא לוגיקה באפליקציה |
| Webhook של Woo אובד | 🔴 גבוה | Woo שולח retry אוטומטית על כשל; תשלום שנשאר `pending` נראה לאדמין ב-`/admin/payments` לסימון ידני |
| התנגשות ססיה ב-materialization | 🟡 בינוני | התראה לאדמין + חסימת אישור ססיה מתנגשת מראש |
| חיוב כפול | 🔴 גבוה | `payplus_transaction_uid` UNIQUE + אידמפוטנטיות |
| מטפל רואה נתוני מטפל אחר | 🔴 גבוה | RLS + `public_availability` ללא `user_id` |
| שעון קיץ (DST) | 🟡 בינוני | הכל `timestamptz`, חישובים ב-`Asia/Jerusalem` |
| חיובים נכשלים בהמוני | 🟡 בינוני | 3 ניסיונות + התראה + השעיה לא הרסנית |

---

## נספח א' — סיד לנתוני החדרים

**הוד השרון — השחר 13**
| חדר | סוג | תיאור |
|---|---|---|
| Room 1 | talk | הקטן במתחם. ספה זוגית, כורסא, שולחן עבודה |
| Room 2 | talk | 3 כורסאות. יחיד או זוג |
| Room 3 | talk | ספה זוגית + כורסא |
| Room 4 | talk | ספה זוגית + כורסא |
| Room 5 | **touch** | מיטת טיפולים, כיור, פרגוד, שרפרף. מתאים לדיקור |

**נווה ימין** *(כתובת חסרה)*
| חדר | סוג | תיאור |
|---|---|---|
| Room 1 | **podcast** | חדר פודקאסט זוגי |
| Room 2 | talk | 3 כיסאות, לוח מחיק, שולחן צד |
| Room 3 | **touch** | מגע+שיח: מיטה, 2 כורסאות, שולחן |
| Room 4 | **touch** | מגע+שיח |
| Room 5 | **touch** | מגע+שיח |

*כל החדרים: WiFi, שולחן+כיסא, מתקן תלייה, ממחטות, לוח מחיק. נווה ימין: שלט מגנטי + מזגן נפרד בכל חדר.*

## נספח ב' — קודי שגיאה

```
NO_CREDIT              אין יתרת שעות בתוקף
INSUFFICIENT_HOURS     היתרה קטנה מהמבוקש
DEPOSIT_DEPLETED       הפיקדון חסר — נדרשת השלמה
CARD_EXPIRED           הכרטיסייה פגה
ROOM_TAKEN             המשבצת נתפסה זה עתה
ROOM_UNAVAILABLE       החדר חסום / לא פעיל
SELF_OVERLAP           חפיפה עם הזמנה קיימת שלך
TOO_FAR_AHEAD          מעבר ל-30 יום
TOO_FAR_PAST           התחלה מלפני יותר מ-30 יום (create_booking בלבד)
INVALID_SLOT           לא מיושר ל-30 דקות
BOOKING_PASSED         המועד עבר (cancel_booking בלבד)
SESSION_NOT_CANCELLABLE  מפגש ססיה לא ניתן לביטול עצמי
SESSION_HOURS_FIXED     סך המשבצות לא שווה בדיוק session_base_hours
USER_SUSPENDED         החשבון מושעה
PAYMENT_REQUIRED       נדרש תשלום
FORBIDDEN              אין הרשאה
```
