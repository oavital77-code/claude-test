-- זקיפה מיידית של רכישת כרטיסייה מ-Woo למטפל/ת שכבר רשום/ה (15/10, ליל ההשקה).
--
-- עד עכשיו רכישה שהתגלתה (webhook/poll) נשמרה ב-woo_pending_purchases ונזקפה
-- רק כשהמטפל/ת עצמו/ה טוען/ת עמוד באפליקציה (claim_woo_pending_purchase).
-- poll שמופעל ע"י טעינה של משתמש אחר (או ה-cron) לא זקף כלום — והרכישה לא
-- הופיעה אצל המטפל/ת ובמסך האדמין עד הכניסה הבאה שלה (מאיה סימון, 21:24).
--
-- הקריטריון זהה בדיוק ל-claim_woo_pending_purchase: התאמת profiles.email
-- (case-insensitive) — רק העיתוי מוקדם יותר. אין התאמה / יותר מאחת → נשאר
-- pending כמו קודם (claim בכניסה / שיוך ידני ע"י אדמין).
--
-- כשל כאן לעולם לא חוסם את שמירת הרכישה עצמה (exception נבלע) — במקרה כזה
-- המסלול הישן (claim בכניסה) עדיין תופס אותה.

create or replace function public.auto_claim_woo_pending_purchase()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_matches int;
begin
  if new.status <> 'pending' or new.email is null or new.expires_at <= now() then
    return null;
  end if;

  select count(*), min(id::text)::uuid into v_matches, v_user_id
  from profiles
  where lower(email) = lower(new.email);

  if v_matches <> 1 then
    return null;
  end if;

  begin
    perform grant_woo_pending_purchase(new.id, v_user_id, 'woo_purchase_auto_claimed');
  exception when others then
    -- best-effort: נשאר pending, claim בכניסה הבאה / שיוך ידני
    null;
  end;

  return null;
end;
$$;

revoke all on function public.auto_claim_woo_pending_purchase() from public, anon, authenticated;

drop trigger if exists woo_pending_purchases_auto_claim on public.woo_pending_purchases;
create trigger woo_pending_purchases_auto_claim
  after insert on public.woo_pending_purchases
  for each row execute function public.auto_claim_woo_pending_purchase();
