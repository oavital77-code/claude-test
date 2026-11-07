-- 07/11, החלטת הבעלים: בדיקת הרכישות ברקע — פעם בשעה (24 הפעלות ביום).
-- רכישה נקלטת מיד כשהמטפל/ת חוזר/ת לאפליקציה (PurchaseSync), ולכל המאוחר
-- תוך שעה ע"י הבדיקה הזו. חלון של 120 דקות מכסה ריצה אחת שנכשלה.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'poll-woo-every-minute'),
  schedule := '0 * * * *'
);
