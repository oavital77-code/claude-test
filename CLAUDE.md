# CLAUDE.md — בקליניקה

מערכת ניהול השכרת קליניקות. ~300 מטפלים, 2 סניפים, 10 חדרים.
**האפיון המלא: `baclinica-spec.md` — קרא אותו לפני כל משימה.**

---

## Stack

- Next.js 15 (App Router) + TypeScript strict
- Supabase (Postgres 15, Auth, Realtime, RLS)
- Tailwind + shadcn/ui, **RTL**
- Vercel + Vercel Cron
- WooCommerce (baclinica.co.il — תשלומים, כל סוגי הרכישה), Resend (מיילים)

## מבנה

```
app/
  (app)/      → cleana.co.il         ממשק מטפלים (PWA, mobile-first)
  (admin)/    → cleana.co.il/admin   פאנל ניהול (desktop-first; תת-דומיין admin.cleana.co.il מתוכנן ב-middleware, טרם הופעל בפרודקשן)
  api/
    payplus/callback/   ← webhook (אימות hash חובה)
    cron/               ← materialize, renewals, reminders
lib/
  supabase/   client, server, admin
  payplus/
  time/       ← כל חישובי הזמן. Asia/Jerusalem
supabase/migrations/
```

---

## 🔴 חוקי ברזל — אסור לעבור עליהם

### 1. אין כתיבה ישירה ל-DB בזרימות עסקיות
`bookings`, `punch_cards`, `session_subscriptions` — **רק דרך RPC של Postgres** (`SECURITY DEFINER`, בתוך טרנזקציה). אף פעם `supabase.from('bookings').insert()` בקוד האפליקציה.
**סיבה:** race conditions. 300 מטפלים על 10 חדרים.

### 2. מניעת חפיפה היא ברמת ה-DB
```sql
exclude using gist (room_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
where (status = 'confirmed')
```
אל תוסיף בדיקת "האם פנוי" ב-JS כתחליף. רק כאופטימיזציה של UX.

### 3. מטפל לעולם לא רואה מטפל אחר
זמינות נחשפת **אך ורק** דרך ה-view `public_availability` (room_id, starts_at, ends_at, kind).
אין `user_id`. אין שמות. אין סוג הזמנה. אם אתה כותב query שמחזיר `bookings` של משתמש אחר — עצור.

### 4. מפגש ססיה לא ניתן לביטול ע"י מטפל
`source = 'session'` → `cancel_booking` זורק `SESSION_NOT_CANCELLABLE`. תמיד. רק אדמין.

### 5. ססיה: אישור לפני תשלום
`requested → [אדמין] → awaiting_payment → [תשלום] → active`
אין יצירת דף תשלום לפני `approve_session`. לעולם.

`request_session` (בקשה ראשונית ע"י מטפל/ת) **לא בודקת זמינות משבצות** —
תמיד מגיעה לאדמין, גם אם המשבצת תפוסה, כדי לא לחשוף על מטפל/ת אחר/ת (חוק
#3). `approve_session` **כן** בודק זמינות בפועל ונחסם אם יש התנגשות אמיתית —
הפתרון במקרה כזה הוא `admin_create_session`: אדמין קובע ססיה חופשית לגמרי
(כל חדר/יום/שעה, בלי שום בדיקת התנגשות), ישר ל-`awaiting_payment` (מדלג רק
על שלב 'requested' — הקביעה ע"י אדמין היא עצמה האישור). התשלום עצמו **לעולם
לא מדולג** גם כאן — אותו מסלול תשלום בדיוק דרך חנות ה-Woo. `request_session`
ו-`admin_create_session` שניהם מקבלים `start_date` אופציונלי (ברירת מחדל:
היום) שנשמר על `session_subscriptions.start_date` כבר בשלב הבקשה/הקביעה.

**חריגה יחידה ומפורשת:** קליטת מטפלת ותיקה מ-Skedda (סעיף "קליטה מ-Skedda"
ב-OPERATIONS.md) — היא כבר שילמה על הססיה שלה במערכת הישנה, אז
`admin_create_session_prepaid` מדלג גם על התשלום הראשוני (נכנס ישר
ל-`active`). זה **לא** דלת אחורית כללית — הפונקציה משמשת אך ורק את מסך
הקליטה מ-Skedda; החיוב החודשי הרגיל ממשיך כרגיל מהחודש הבא.

### 6. תשלום: מקור האמת הוא ה-הזמנה עצמה ב-Woo
כל תשלום — כרטיסייה וססיה כאחד — מתבצע בחנות ה-Woo (baclinica.co.il), לא
ב-Cleana. שני מסלולי גילוי אפשריים, שניהם מזינים את אותה `processWooOrder`
(`lib/woo/process-order.ts`): (א) webhook — אמת חתימת HMAC מול
`WOOCOMMERCE_WEBHOOK_SECRET` לפני כל עדכון סטטוס; (ב) polling דרך REST API
(`WOOCOMMERCE_KEY`/`WOOCOMMERCE_SECRET`, הרשאת Read בלבד) — כשאין webhook
מוגדר בחנות. `payplus_transaction_uid` הוא `UNIQUE` — כל עדכון אידמפוטנטי,
בלי קשר לאיך שהתגלה.

### 7. אין הזמנה בלי יתרה
כרטיסייה בתוקף עם `hours_remaining >= hours` **וגם** `deposit_remaining = deposit_amount`.
בחירה FIFO לפי `expires_at ASC`, עם `FOR UPDATE`.

### 8. זמנים
- הכל `timestamptz`. אזור: `Asia/Jerusalem`. שים לב ל-DST.
- הזמנות מיושרות ל-30 דקות.
- `starts_at`/`ends_at` = הזמנים **העגולים** (09:00–10:00).
- כניסה בפועל = `starts_at − 5min`, פינוי = `ends_at − 5min`. **זו תצוגה בלבד** — חישובי חפיפה על הערכים העגולים.
- 09:00–10:00 ו-10:00–11:00 **לא** מתנגשים.

---

## תמחור

```ts
// כרטיסייה: 5 מדרגות מ-DB (punch_card_tiers)
// 10ש'/55 · 20ש'/50 · 30ש'/45 · 40ש'/40 · 50ש'/35   (לפני מע"מ)
// פיקדון: המנגנון קיים (deposit_amount/deposit_remaining) אבל כרגע כבוי —
// deposit_hours=0 בכל המדרגות (כרטיסיות חדשות לא גובות פיקדון). כרטיסיות
// ישנות שכבר שילמו פיקדון ממשיכות לאכוף אותו כרגיל.

// ססיה — היקף קבוע (5 שעות שבועיות בדיוק), מחיר קבוע. אין תמחור שולי.
monthlyPrice = 600

// מע"מ 18%, תמיד מוצג בנפרד
```

## ביטולים

| | חלון | מעבר | בתוך |
|---|---|---|---|
| כרטיסייה | 24ש' | זיכוי שעות | נשרף |
| ססיה — מפגש | — | ❌ אסור | ❌ |
| ססיה — מנוי | 30 יום | פעיל עד סוף התקופה | — |

## הזמנה רטרואקטיבית (כרטיסייה בלבד)

`create_booking` מקבל `starts_at` עד 30 יום אחורה (לא רק עתיד) — מכסה גם
"הארכה באותו רגע" (המפגש גלש, תופסים את המשבצת הבאה שכבר התחילה) וגם רישום
בדיעבד של לקוח שנכנס לטיפול בלי הזמנה מראש. אותן בדיקות בדיוק (חפיפה,
יתרה, פיקדון) — רק חלון הזמן התרחב. **לא חל על ססיה**: `create_booking`
לעולם לא יוצר הזמנת ססיה (`materialize_session_bookings` בלבד יוצר אותן),
כך שחוק הביטול של ססיה למעלה לא נוגע לכאן. הזמנה כזו מסומנת ב-audit_log
כ-`booking_created_retroactively` (severity `alert`) לשקיפות מול אדמין.

---

## מוסכמות קוד

- **עברית ו-RTL בכל ה-UI.** `dir="rtl"`, פונט Heebo/Assistant.
- כל הודעות המשתמש בעברית. קודי שגיאה באנגלית (נספח ב' באפיון).
- תאריכים: `date-fns` + `he` locale. `dd/MM/yyyy`, שעון 24.
- מטבע: `₪1,234` (`Intl.NumberFormat('he-IL')`).
- Server Components כברירת מחדל. `'use client'` רק כשצריך.
- Zod לכל קלט. אף פעם לא לסמוך על ולידציה בצד לקוח.
- טיפוסים מ-`supabase gen types typescript`. אין `any`.
- לוגים: אף פעם לא PII (ת"ז, טלפון) ולא נתוני כרטיס.

## Cron

| מתי | מה |
|---|---|
| 03:00 | `materialize_session_bookings` — רולינג 90 יום |
| 09:00 | תזכורות 24 שעות + התראות יתרה נמוכה + תזכורת חידוש ססיה (7 ימים מראש, למטפל/ת ולהנהלה) |
| כל שעה | ניקוי holds פגי תוקף + סגירת ביטולים + פקיעת מנוי ססיה שלא חודש |

## סדר עבודה

M0 סכמה+RLS → M1 auth → M2 לוח → M3 תשלומים → M4 הזמנות → M5 ססיות → M6 אדמין → M7 מיילים → M8 PWA → M9 השקה

**לפני מעבר ל-Milestone הבא:** בדיקות עוברות + הרצה ידנית של הזרימה.

## אסור

- ❌ localStorage לנתוני אמת
- ❌ Service Role key בצד לקוח
- ❌ בדיקת זמינות בלי `FOR UPDATE`
- ❌ עדכון תשלום מ-redirect
- ❌ הצגת פרטי מטפל למטפל אחר
- ❌ SMS מלבד OTP
- ❌ שינוי מדיניות ביטול בלי לעדכן את `app_settings`
