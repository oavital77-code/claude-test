# CLAUDE.md — בקליניקה

מערכת ניהול השכרת קליניקות. ~300 מטפלים, 2 סניפים, 10 חדרים.
**האפיון המלא: `baclinica-spec.md` — קרא אותו לפני כל משימה.**

---

## Stack

- Next.js 15 (App Router) + TypeScript strict
- Supabase (Postgres 15, Auth, Realtime, RLS)
- Tailwind + shadcn/ui, **RTL**
- Vercel + Vercel Cron
- PayPlus (תשלומים), Resend (מיילים)

## מבנה

```
app/
  (app)/      → app.baclinica.co.il   ממשק מטפלים (PWA, mobile-first)
  (admin)/    → admin.baclinica.co.il פאנל ניהול (desktop-first)
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

### 6. תשלום: מקור האמת הוא ה-callback
לא ה-redirect. אמת hash מול `PAYPLUS_SECRET_KEY` לפני כל עדכון סטטוס.
`payplus_transaction_uid` הוא `UNIQUE` — כל callback אידמפוטנטי.

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
// פיקדון = 2 × price_per_hour, משולם מראש

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
| כל 15 דק' | סנכרון תשלומים `pending` מול PayPlus |
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
