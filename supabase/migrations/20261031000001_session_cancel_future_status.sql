-- ביטול ססיה ע"י אדמין מתאריך עתידי (בדיקה מעמיקה 31/10).
--
-- הבאג: admin_session_cancel עם p_from עתידי קבע effective_end_date אבל השאיר
-- status = 'active'. ה-cron (expire_session_holds_and_cancellations) סוגר רק
-- 'pending_cancellation' שתאריכו עבר — אז המנוי נשאר "פעיל" לתמיד: נספר
-- בדוחות כססיה פעילה, ותזכורת החידוש (send-reminders, status='active') הייתה
-- נשלחת למטפל/ת ולהנהלה על ססיה שכבר הסתיימה. 4 מנויים כאלה נמצאו בפרודקשן.
--
-- התיקון: ביטול עתידי של מנוי פעיל → 'pending_cancellation' — אותו מצב בדיוק
-- כמו בקשת ביטול של המטפל/ת: ממשיך עד effective_end_date (materialize מכבד
-- אותו), ואז ה-cron השעתי סוגר ל-'cancelled'. מנוי שהסתיים בסוף טווח
-- התחייבות (term) נשאר 'active' כמו קודם — שם זה מכוון (ממתין להחלטת אדמין,
-- ר' 20260901000002).

create or replace function admin_session_cancel(p_subscription_id uuid, p_from date)
returns integer as $$
declare
  v_sub session_subscriptions%rowtype;
  v_cancelled integer;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_sub from session_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status not in ('active', 'pending_cancellation', 'awaiting_payment', 'requested') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;
  if p_from is null then
    p_from := current_date;
  end if;

  update bookings
  set status = 'cancelled_by_admin', cancelled_at = now(), cancelled_by = auth.uid(), hours_refunded = false
  where subscription_id = p_subscription_id and status = 'confirmed'
    and (starts_at at time zone 'Asia/Jerusalem')::date >= p_from;
  get diagnostics v_cancelled = row_count;

  update session_subscriptions
  set effective_end_date = p_from - 1,
      status = case
        when p_from <= current_date then 'cancelled'::sub_status
        when status = 'active' then 'pending_cancellation'::sub_status
        else status
      end
  where id = p_subscription_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_cancelled_by_admin', 'session_subscriptions', p_subscription_id,
          jsonb_build_object('from', p_from, 'cancelled_bookings', v_cancelled));
  return v_cancelled;
end;
$$ language plpgsql security definer set search_path = public;

-- תיקון נתונים: 4 המנויים שנתקעו 'active' עם תאריך סיום שעבר (19/10–29/10).
-- כולם קליטה מ-Skedda בלי טווח התחייבות (term_months = null), כלומר לא
-- מקרה ה-term המכוון. מזהים מפורשים — לא תנאי כללי.
with fixed as (
  update session_subscriptions
  set status = 'cancelled'
  where id in (
    '5d4417ad-24a7-4cd3-977e-c91225c1b87d',
    'be5ccd30-9fa2-490d-bc53-692ff1b051d6',
    '27aadea0-1944-47fa-89c1-ac192d6c6c70',
    'a037f918-a3a0-49c8-aa6a-9958b34dbc25'
  )
    and status = 'active'
    and effective_end_date < current_date
  returning id, effective_end_date
)
insert into audit_log (actor_id, action, entity, entity_id, before, after)
select null, 'session_closed_after_end_date', 'session_subscriptions', id,
       jsonb_build_object('status', 'active'),
       jsonb_build_object('status', 'cancelled', 'effective_end_date', effective_end_date,
                          'note', 'תיקון: ביטול עתידי נשאר active (בדיקה מעמיקה 31/10)')
from fixed;
