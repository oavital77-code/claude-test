---
name: therapist-case
description: תיק מטפל/ת — בירור מלא של מטפל/ת ספציפי/ת ב-Cleana לפי שם, מייל או טלפון: חשבון והתחברות, כרטיסיות ויתרות, ססיות ומשבצות, הזמנות, תשלומים ורכישות מהחנות, מיילים שנשלחו ויומן פעולות — ואבחון של הבעיה המדווחת עם תיקון מוצע. Use when the user reports a problem with a specific therapist, e.g. "X לא מצליחה להיכנס", "X לא רואה את הססיה", "X קנה ולא התעדכן", "X לא קיבל מייל", "תבדוק את X", "מה המצב של X". Argument: the therapist's name/email/phone and (optionally) the complaint.
---

# תיק מטפל/ת — Cleana

קלט: שם / מייל / טלפון של מטפל/ת, ובדרך כלל גם התלונה ("לא רואה", "קנתה ולא התעדכן"...).

**כלל יסוד: קודם לאבחן, אחר כך לתקן — ורק באישור.** הסקיל קורא נתונים בלבד. כל
תיקון נתונים מוצג כהצעה, ומבוצע רק אחרי "מאשר" מהמשתמש, ורק במסלול המותר (למטה).

Supabase: `ekfgidxqjuysllkqdygl` (לא Cleana+). זמנים ב-DB ב-UTC → להציג בשעון ישראל.

## שלב 1 — זיהוי

```sql
select p.id, p.full_name, p.role, p.status, p.email, p.phone, p.created_at,
  u.email as auth_email, u.email_confirmed_at is not null as email_confirmed, u.last_sign_in_at,
  (u.raw_user_meta_data->>'must_change_password') as must_change_password,
  coalesce(lower(p.email) = lower(u.email), false) as emails_match,
  (select allowed from therapist_credit_allowance a where a.user_id = p.id) as credit_allowed
from profiles p left join auth.users u on u.id = p.id
where p.full_name ilike '%' || '<QUERY>' || '%' or p.email ilike '%' || '<QUERY>' || '%' or p.phone like '%' || '<QUERY>' || '%'
limit 10;
```

- 0 תוצאות → לנסות חלק מהשם / שם באנגלית / ספרות הטלפון בלי קידומת. עדיין 0 → אין חשבון
  (אולי נרשמה במייל אחר — לחפש בחשבונות auth: `select id, email, created_at from auth.users where email ilike '%<חלק>%'`).
- יותר מתוצאה אחת → **לבדוק כפילות חשבונות** (אותו אדם, שני מיילים) — סיבה נפוצה ל"לא רואה".

## שלב 2 — כל התיק (להחליף `<USER_ID>`)

```sql
with u as (select '<USER_ID>'::uuid as id)
select
  (select coalesce(json_agg(json_build_object('purchased', c.purchased_at::date, 'hours', c.hours_purchased, 'remaining', c.hours_remaining,
      'expires', c.expires_at::date, 'active', c.active, 'deposit', c.deposit_amount, 'deposit_left', c.deposit_remaining) order by c.expires_at), '[]')
   from punch_cards c where c.user_id = (select id from u)) as cards,
  (select coalesce(json_agg(json_build_object('id', s.id, 'status', s.status, 'start', s.start_date, 'end', s.effective_end_date,
      'weekly_hours', s.weekly_hours, 'price', s.monthly_price, 'next_billing', s.next_billing_date,
      'slots', (select json_agg(json_build_object('weekday', ss.weekday, 'from', ss.start_time, 'to', ss.end_time, 'room', r.name, 'valid_from', ss.valid_from, 'valid_until', ss.valid_until))
                from session_slots ss join rooms r on r.id = ss.room_id where ss.subscription_id = s.id)) order by s.created_at), '[]')
   from session_subscriptions s where s.user_id = (select id from u)) as sessions,
  (select coalesce(json_agg(x order by x.starts_at), '[]') from (
     select b.starts_at, b.ends_at, b.status, b.source, r.name as room, b.admin_note
     from bookings b join rooms r on r.id = b.room_id
     where b.user_id = (select id from u) and b.starts_at between now() - interval '7 days' and now() + interval '14 days') x) as bookings_window,
  (select json_build_object('upcoming_confirmed', count(*) filter (where status = 'confirmed' and ends_at > now()),
                            'cancelled_30d', count(*) filter (where status <> 'confirmed' and starts_at > now() - interval '30 days'))
   from bookings where user_id = (select id from u)) as booking_counts,
  (select coalesce(json_agg(json_build_object('type', type, 'status', status, 'amount', amount_total, 'at', created_at, 'uid', payplus_transaction_uid) order by created_at desc), '[]')
   from (select * from payments where user_id = (select id from u) order by created_at desc limit 10) p) as payments,
  (select coalesce(json_agg(json_build_object('order', woo_order_id, 'status', status, 'amount', amount_total, 'at', created_at, 'claimed_at', claimed_at)), '[]')
   from woo_pending_purchases w where w.claimed_by = (select id from u)
      or lower(w.email) = (select lower(email) from profiles where id = (select id from u))) as woo_purchases,
  (select coalesce(json_agg(json_build_object('action', a.action, 'at', a.created_at, 'after', a.after) order by a.created_at desc), '[]')
   from (select * from audit_log a
         where a.actor_id = (select id from u) or a.entity_id = (select id from u)
            or a.entity_id in (select id from session_subscriptions where user_id = (select id from u))
            or a.entity_id in (select id from bookings where user_id = (select id from u))
         order by a.created_at desc limit 15) a) as audit_recent;
```

מיילים שנשלחו אליה/ו (התחברות, איפוס סיסמה, אישורי הזמנה): `mcp__Resend__list-emails`
וסינון לפי הנמען — לבדוק `last_event` (delivered / bounced / complained).

## שלב 3 — אבחון לפי סוג התלונה

**"לא מצליח/ה להיכנס"**
- אין חשבון / מייל אחר (שלב 1). `email_confirmed = false` → לא אישר/ה מייל.
- `must_change_password = true` → תקוע/ה במסך החלפת סיסמה.
- מייל איפוס לא הגיע → Resend: bounced / לא נשלח. הרשמה חוזרת עם מייל קיים לא שולחת מייל (מוצגת הודעת "כבר יש חשבון").
- `status = suspended` → מושעה.

**"קנה/תה ולא התעדכן"**
- יש שורה ב-`woo_pending_purchases` עם `status <> 'claimed'` → המייל בהזמנה ≠ המייל בחשבון. תיקון: שיוך ידני מעמוד המטפל/ת בפאנל, או התחברות עם מייל ההזמנה.
- אין שורה בכלל → הרכישה לא נקלטה מהחנות. לבדוק את הבדיקה כל דקה (סקיל `health-check`, שלב 1).
  תיקון (באישור בלבד): הכנסת שורה ל-`woo_pending_purchases` (woo_order_id, tier_id לפי `woo_product_tiers`, email, quantity, amount_total) —
  ה-trigger `auto_claim_woo_pending_purchase` זוקף אוטומטית בדיוק כמו קליטה רגילה. **לעולם לא** insert ישיר ל-`punch_cards`.
- ססיה: `audit_log` עם `woo_payment_unmatched` → תשלום שלא שויך; לבדוק `session_subscriptions.status` (צריך `awaiting_payment` לתשלום פתיחה).

**"לא רואה את הססיה / ההזמנה"**
- הססיה `active`? `start_date` בעתיד? משבצת עם `valid_until` שעבר?
- יש הזמנות `confirmed` בחלון? אם אין — `materialize` לא יצר: לחפש ב-audit `session_materialization_conflict` / `session_materialization_blocked`.
- הנתונים תקינים → בעיית תצוגה: במסך "ההזמנות שלי" "קרובות" = עד שהמפגש **נגמר**, ממוין מהקרוב לרחוק. בלוח הזמנים — זיהוי "שלי" לפי התאמה ל-`public_availability`.
- כפילות חשבונות (שלב 1).

**"לא קיבל/ה מייל"**
- Resend לפי נמען. אין שליחה → לבדוק אם הזרימה שולחת בכלל (קביעה ע"י אדמין שולחת מאז 28/10; אין שליחה רטרו).

**"אין לו/ה שעות / לא מצליח/ה לקבוע"**
- כרטיסייה בתוקף עם `remaining >= hours` **וגם** `deposit_left = deposit` (חוק #7). `credit_allowed` → אשראי שעות.

## שלב 4 — דוח

עברית, קצר וענייני:

```
**<שם>** — <פעיל/ה · מחובר/ת לאחרונה DD/MM HH:MM>

**הבעיה:** <משפט אחד — מה מצאתי>
**למה:** <הסיבה, עם הנתון שמוכיח>
**הנתונים:** כרטיסיות <..> · ססיות <..> · הזמנות קרובות <N>
**מה לעשות:** <פעולה אחת ברורה — של המשתמש, של המטפל/ת, או תיקון שלי באישור>
```

- אם הנתונים תקינים והבעיה בתצוגה/בקוד — לומר זאת, ולהציע תיקון קוד (שעובר בדיקות + PR כרגיל).
- אם הבעיה כנראה פוגעת גם באחרים — לציין ("זה לא רק אצלה").
- פרטים אישיים (מייל/טלפון) — רק כשצריך לפעולה. אף פעם לא ב-commit / PR / קוד.
- לא להבטיח שתוקן לפני שנבדק בפועל (שאילתה חוזרת אחרי התיקון).
