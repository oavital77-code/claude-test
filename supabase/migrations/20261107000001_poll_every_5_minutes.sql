-- 07/11: חשבון ה-Vercel (Hobby) הושבת על חריגה ממכסה. בדיקת הרכישות ירדה
-- מכל דקה לכל 5 דקות (288 הפעלות ביום במקום 1,440).
select cron.alter_job(
  (select jobid from cron.job where jobname = 'poll-woo-every-minute'),
  schedule := '*/5 * * * *'
);
