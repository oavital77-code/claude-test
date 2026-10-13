-- בקליניקה — השהיית חיוב ססיות (13/10).
--
-- בקשת הבעלים בזמן המעבר מ-Skedda: "שיבוץ ססיה לא יחויב עד שאגיד אחרת".
-- דגל app_settings.session_billing_paused (1 = מושהה):
--   • expire_session_holds_and_cancellations לא מעבירה ססיה פעילה ל-'expired'
--     כשתאריך החיוב עבר — אחרת כל הססיות ששובצו היום היו פגות בעוד חודש
--     וההזמנות שלהן מפסיקות להיווצר.
--   • ה-cron של התזכורות לא שולח תזכורת חידוש ססיה (ר' send-reminders).
-- ⚠️ לפני שמחזירים ל-0: לעדכן next_billing_date של הססיות הפעילות לתאריך
-- עתידי, אחרת כל מי שתאריך החיוב שלה עבר תפוג בריצה הבאה.

insert into app_settings (key, value)
select 'session_billing_paused', '1'::jsonb
where not exists (select 1 from app_settings where key = 'session_billing_paused');

create or replace function expire_session_holds_and_cancellations()
returns void as $$
begin
  perform assert_service_or_admin();

  update session_subscriptions
  set status = 'expired'
  where status in ('requested', 'awaiting_payment') and hold_expires_at < now();

  update session_subscriptions
  set status = 'cancelled'
  where status = 'pending_cancellation' and effective_end_date < current_date;

  if coalesce((select (value#>>'{}')::numeric from app_settings where key = 'session_billing_paused'), 0) <> 1 then
    update session_subscriptions
    set status = 'expired'
    where status = 'active' and next_billing_date < current_date;
  end if;
end;
$$ language plpgsql security definer set search_path = public;
