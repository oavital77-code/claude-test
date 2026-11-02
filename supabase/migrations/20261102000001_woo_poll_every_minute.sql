-- בדיקת רכישות בחנות כל דקה, בלי תלות בכך שמישהו פותח את האפליקציה.
-- Vercel Hobby מאפשר cron יומי בלבד, אז pg_cron כאן קורא (pg_net) לנתיב
-- /api/cron/poll-woo-frequent בכל דקה. הסוד נשמר ב-Vault (woo_poll_secret)
-- וזהה ל-WOO_POLL_SECRET ב-Vercel; הוא לא בקובץ הזה.
--
-- הסוד נוצר פעם אחת, מחוץ למיגרציה:
--   select vault.create_secret('<secret>', 'woo_poll_secret', '...');
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'poll-woo-every-minute',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://cleana.co.il/api/cron/poll-woo-frequent',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'woo_poll_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);
