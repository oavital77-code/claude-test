-- התראה על כשל בבדיקת הרכישות כל דקה — רק אחרי 5 כשלים רצופים (5 דקות),
-- לא על תקלה רגעית בחנות (503 בודד ב-02/11 17:17 שלח מייל מיותר). הצלחה
-- אחת מאפסת. אחרי התראה — לכל היותר אחת נוספת כל 6 שעות.
alter table woo_poll_state
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_failure_alert_at timestamptz;

-- מחזיר true כשצריך לשלוח התראה עכשיו (ומסמן אותה באותה פעולה — בלי מרוץ).
create or replace function record_woo_poll_result(
  p_ok boolean,
  p_threshold integer default 5,
  p_alert_every interval default '6 hours'
)
returns boolean as $$
declare
  v_alert boolean;
begin
  perform assert_service_or_admin();
  if p_ok then
    update woo_poll_state set consecutive_failures = 0 where id = 1 and consecutive_failures > 0;
    return false;
  end if;
  update woo_poll_state set consecutive_failures = consecutive_failures + 1 where id = 1;
  update woo_poll_state set last_failure_alert_at = now()
  where id = 1
    and consecutive_failures >= p_threshold
    and (last_failure_alert_at is null or last_failure_alert_at < now() - p_alert_every)
  returning true into v_alert;
  return coalesce(v_alert, false);
end;
$$ language plpgsql security definer set search_path = public;
