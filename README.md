# בקליניקה

מערכת ניהול השכרת קליניקות. ר' `baclinica-spec.md` למסמך האפיון המלא, `CLAUDE.md` לחוקי הפיתוח, ו-`OPERATIONS.md` למדריך תפעול (Vercel/Supabase/הרשאות אדמין/בעיות ידועות).

## פיתוח

```bash
npm install
cp .env.example .env.local   # מלא/י את משתני הסביבה
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — ממשק המטפלים. פאנל האדמין: [http://localhost:3000/admin](http://localhost:3000/admin).

## מסד נתונים

מיגרציות ב-`supabase/migrations/`, מיושמות דרך [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <project-id>
supabase db push
```
