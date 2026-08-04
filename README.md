# Voltsafe – עמוד נחיתה + רשימת המתנה

אתר one-page ל-Voltsafe, בנוי ב-Next.js (App Router) + TypeScript + Tailwind
CSS, עברית מלאה (RTL). כולל: עמוד שיווקי, טופס הרשמה לרשימת המתנה, תקנון
ומדיניות פרטיות.

## הרצה מקומית

```bash
npm install
npm run dev
```

פתחו [http://localhost:3000](http://localhost:3000).

## מבנה

- `src/app/page.tsx` – הרכבת עמוד הבית מהקומפוננטות ב-`src/components`
- `src/app/terms`, `src/app/privacy` – תקנון ומדיניות פרטיות
- `src/app/api/waitlist/route.ts` – מקבל הרשמות לרשימת ההמתנה
- `public/images` – תמונות המוצר

## חיבור הרשמות לאימייל בפועל

כרגע כל הרשמה לרשימת ההמתנה נרשמת ל-server logs של הפלטפורמה (למשל
Vercel → Project → Logs). כדי לקבל גם התראת אימייל בפועל על כל הרשמה:

1. פתחו חשבון חינמי ב-[Resend](https://resend.com) וקבלו API key.
2. באתר Vercel, הוסיפו משתני סביבה לפרויקט:
   - `RESEND_API_KEY` – המפתח מ-Resend
   - `WAITLIST_NOTIFY_EMAIL` – כתובת המייל לקבלת ההתראות (ברירת מחדל:
     `oavital77@gmail.com`)
3. פרסמו מחדש (redeploy). מרגע זה כל הרשמה תישלח גם כמייל.

אין צורך בשינוי קוד – ה-API route ב-`src/app/api/waitlist/route.ts` כבר
תומך בכך אוטומטית ברגע שמוגדר `RESEND_API_KEY`.

## פריסה (Deploy)

מומלץ [Vercel](https://vercel.com/new) – מתאים באופן טבעי ל-Next.js.
חברו את ה-repo, הגדירו את משתני הסביבה הנ"ל (אופציונלי), ולחצו Deploy.

## מה עוד חסר להשקה מלאה

- **פרטי חברה משפטיים** – בתקנון (`src/app/terms/page.tsx`) יש placeholder
  לפרטי התאגיד (שם חברה/עוסק, ח.פ., כתובת) שיש להשלים לפני שהאתר יוצא
  לאוויר בפועל.
- **דומיין** – כרגע `metadataBase` ב-`src/app/layout.tsx` מצביע ל-
  `voltsafe.example`, יש לעדכן כשיהיה דומיין אמיתי.
- **מסלול רכישה בפועל** – האתר כרגע הוא רשימת המתנה בלבד ללא סליקה.
  כשתהיה מוכנות למכירה בפועל, יש להוסיף ספק סליקה (Tranzila / Cardcom /
  Stripe וכו') ותנאי מכירה נפרדים (כולל זכות ביטול עסקה כדין).
