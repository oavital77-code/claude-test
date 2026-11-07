---
name: health-check
description: בדיקת מצב מלאה של מערכת Cleana בפרודקשן — רכישות מהחנות (בדיקה כל דקה, רכישות שלא שויכו), שלמות הזמנות (חפיפות, יישור), ססיות, מטפלים, התראות ביומן, פריסות ושגיאות ב-Vercel, ובדיקות GitHub — ומחזירה דוח קצר בעברית "תקין / דורש טיפול". Use when the user asks "בדיקת מצב", "סטטוס", "סטטוס כללי", "מה קורה", "הבדיקות עברו?", "הכל תקין?", "אני יכול להיות רגוע?", "כמה מטפלים יש", "מה מדד העומס", or receives an alert email and asks what it means. Read-only — never changes data.
---

# בדיקת מצב — Cleana

מטרה: תמונת מצב אמיתית של המערכת, מבוססת נתונים, בפחות מדקה קריאה. **קריאה בלבד** —
אף פעם לא לשנות נתונים, לא לפרוס ולא לתקן במסגרת הסקיל. אם נמצאה בעיה: לדווח
ולהציע תיקון, ולחכות לאישור.

## מזהים (פרודקשן)

| | ערך |
|---|---|
| Supabase (הנכון!) | `ekfgidxqjuysllkqdygl` — **לא** `aalbnijekgnxwzvnykxz` (זה Cleana+) |
| Vercel team | `team_IDzT5aj55L1btI8Q5RWxN3zm` |
| Vercel project (cleana.co.il) | `prj_bRwsXq0JqZM1zJRLDyasigOG5dlv` (baclinica) |
| GitHub | `oavital77-code/claude-test`, ענף `master` |

## שלב 1 — רכישות מהחנות ובדיקה כל דקה

`mcp__Supabase__execute_sql`:

```sql
select
  (select count(*) from net._http_response where created > now() - interval '24 hours' and status_code = 200) as poll_ok_24h,
  (select count(*) from net._http_response where created > now() - interval '24 hours' and status_code is distinct from 200) as poll_bad_24h,
  (select extract(epoch from now() - max(created))::int from net._http_response where status_code = 200) as secs_since_ok_poll,
  (select consecutive_failures from woo_poll_state where id = 1) as poll_fail_streak,
  (select count(*) from cron.job_run_details where start_time > now() - interval '24 hours' and status <> 'succeeded') as pgcron_failed_24h,
  (select count(*) from woo_pending_purchases where created_at > now() - interval '24 hours') as purchases_24h,
  (select count(*) from woo_pending_purchases where status <> 'claimed') as purchases_unclaimed,
  (select max(woo_order_id) from woo_pending_purchases) as last_card_order,
  (select max(created_at) from woo_pending_purchases) as last_card_purchase_at,
  (select count(*) from payments where payplus_transaction_uid like 'woo-session-%' and created_at > now() - interval '24 hours') as session_payments_24h;
```

פרשנות:
- `secs_since_ok_poll` > 600 → **דורש טיפול**: הבדיקה ברקע (כל 5 דקות מאז 07/11) לא רצה (pg_cron / Vercel / סוד).
- `poll_fail_streak` ≥ 3 → **דורש טיפול** (וההנהלה כבר קיבלה מייל). 1–2 = תקלה רגעית בחנות, תקין.
- כמה כשלים בודדים ב-24 שעות (503 / timeout של 30 שניות) = החנות איטית לרגע — תקין, לציין במשפט.
- `purchases_unclaimed` > 0 → רכישה שמחכה לחשבון (קונה בלי חשבון במייל הזה). לציין את מספרי ההזמנות.
- `net._http_response` נשמר רק כ-6 שעות — "24h" בפועל = מה שנשמר. לא להציג כמספר יומי מלא.
- פרטי כשל: `select status_code, left(content::text,150), error_msg, created from net._http_response where status_code is distinct from 200 order by id desc limit 5;`

## שלב 2 — שלמות הזמנות, ססיות, מטפלים, התראות

```sql
select
  (select count(*) from bookings a join bookings b on a.room_id = b.room_id and a.id < b.id
     and a.status = 'confirmed' and b.status = 'confirmed'
     and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
     and a.ends_at > now() - interval '1 day') as overlaps,
  (select count(*) from bookings where status = 'confirmed' and ends_at > now()
     and (extract(epoch from starts_at)::bigint % 1800 <> 0 or extract(epoch from ends_at)::bigint % 1800 <> 0)) as misaligned,
  (select count(*) from bookings b where b.status = 'confirmed' and b.ends_at > now() and b.source = 'session'
     and not exists (select 1 from session_subscriptions s where s.id = b.subscription_id and s.status in ('active','pending_cancellation'))) as session_bookings_without_active_sub,
  (select count(*) from session_subscriptions where status = 'active' and effective_end_date is not null and effective_end_date < current_date) as subs_past_end_still_active,
  (select count(*) from profiles where role = 'therapist') as therapists_total,
  (select count(*) from profiles where role = 'therapist' and status = 'active') as therapists_active,
  (select count(*) from profiles where role = 'therapist' and status = 'suspended') as therapists_suspended,
  (select count(*) from profiles where role = 'therapist' and created_at > now() - interval '7 days') as therapists_new_7d,
  (select count(*) from session_subscriptions where status in ('active','pending_cancellation')) as subs_active,
  (select count(*) from session_subscriptions where status = 'requested') as subs_waiting_approval,
  (select count(*) from session_subscriptions where status = 'awaiting_payment') as subs_awaiting_payment,
  (select count(*) from punch_cards where active and expires_at > now() and hours_remaining > 0) as cards_with_balance,
  (select count(*) from punch_cards where active and hours_remaining < 0) as cards_in_debt,
  (select count(*) from bookings where status = 'confirmed' and starts_at::date = (now() at time zone 'Asia/Jerusalem')::date) as bookings_today,
  (select coalesce(json_agg(json_build_object('action', action, 'n', n)), '[]') from (
     select action, count(*) n from audit_log
     where created_at > now() - interval '24 hours'
       and action in ('woo_payment_unmatched','woo_frequent_poll_failed','session_materialization_conflict','session_materialization_blocked','booking_created_retroactively')
     group by action) x) as alerts_24h,
  (select coalesce(json_agg(json_build_object('link', link, 'n', n)), '[]') from (
     select link, count(*) n from link_clicks where created_at > now() - interval '24 hours' group by link) y) as link_clicks_24h;
```

פרשנות — **כל אחד מאלה ≠ 0 הוא "דורש טיפול"** (חוקי הברזל ב-CLAUDE.md):
`overlaps`, `misaligned`, `session_bookings_without_active_sub`, `subs_past_end_still_active`.
`subs_waiting_approval` > 0 → בקשות ססיה שמחכות לאישור אדמין (לא תקלה, פעולה נדרשת).
`cards_in_debt` > 0 → מטפלים באשראי שעות (תקין אם הופעל להם אשראי; לציין).
`alerts_24h` → לפרט כל סוג: מה הוא אומר ומה לעשות.

## שלב 3 — פריסות, שגיאות, GitHub

1. `mcp__Vercel__list_deployments` (projectId + teamId למעלה, `target: production`, limit 3) — הפריסה האחרונה `READY`?
2. `mcp__Vercel__get_runtime_errors` לפרויקט, חלון אחרון (Hobby שומר לוגים כשעה בלבד — אם אין, לכתוב "אין לוגים זמינים", לא "אין שגיאות").
3. `mcp__github__actions_list` → `list_workflow_runs`, `branch: master`, perPage 5 — כל הריצות `success`?

## שלב 4 — דוח

עברית, קצר, בלי סיפורים. מבנה:

```
**שורה תחתונה:** ✅ תקין / ⚠️ X דברים דורשים טיפול

**רכישות:** בדיקה כל דקה — <רצה / לא רצה>, <N> כשלים רגעיים. <N> רכישות ב-24ש'. <אין / N> רכישות שמחכות לשיוך.
**הזמנות:** <N> היום. חפיפות/יישור/ססיות — <תקין / פירוט>.
**מטפלים:** <פעילים> פעילים (<חדשים> חדשים השבוע) · <ססיות> ססיות · <כרטיסיות> כרטיסיות עם יתרה.
**התראות:** <אין / פירוט + מה לעשות>.
**מערכת:** פריסה <READY>, GitHub <עבר>.

**דורש טיפול:** (רק אם יש) — מה, למה, הצעה לתיקון.
```

כללים:
- זמנים — תמיד בשעון ישראל (DB ב-UTC).
- לא להציג מיילים/טלפונים בדוח הכללי. שמות מטפלים — רק כשצריך לפעולה.
- אם נתון לא זמין (לוג שפג, הרשאה) — לומר זאת במפורש, לא להסיק "תקין".
- לא לתקן כלום בלי אישור.

## לקחים מתקלות קודמות

- **07/11:** חשבון ה-Vercel (Hobby) הושבת על חריגה ממכסה — `402 DEPLOYMENT_DISABLED`, האתר נפל לכולם. שודרג ל-Pro. בדיקה: `mcp__Vercel__web_fetch_vercel_url` על `https://baclinica.vercel.app/api/go/evil` — 404 = האתר חי; 402 = מושבת. פריסות שמוזגו בזמן השבתה לא נבנות — לוודא שהפריסה האחרונה ב-production היא של ה-commit האחרון ב-master.

- **31/10–02/11:** שינוי בשאילתת החנות גרם לכך שרכישות לא נקלטו, והכשל נבלע בשקט. סימנים: `last_card_purchase_at` ישן במיוחד בזמן שהחנות מוכרת, או מייל הזמנה מהחנות בלי מייל "רכישת כרטיסייה" מ-Cleana תוך דקה. אם יש חשד — להפעיל את הסקיל `therapist-case` על הקונה.
- אין גישה מהקונטיינר ל-cleana.co.il / baclinica.co.il (proxy). לבדיקת נתיב חי: `mcp__Vercel__web_fetch_vercel_url` על כתובת הפריסה.
- מפתח ה-REST של החנות — קריאה בלבד, בכוונה. אי אפשר ליצור webhook בחנות מכאן.
