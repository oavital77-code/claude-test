-- בקליניקה — ניקוי אוטומטי של חסימות Skedda ברגע שססיה אמיתית מתחילה להגן על המשבצת
--
-- רקע: קליטת מטפלת ותיקה (מסך "קליטה מ-Skedda" ב-/admin/therapists/[id])
-- יוצרת לה ססיה חדשה דרך admin_create_session — ישר ל-awaiting_payment.
-- admin_create_session בכוונה לא בודק שום התנגשות (גם לא מול room_blocks),
-- אז כל עוד הססיה לא שולמה, ה-room_blocks הישן מה-Skedda import הוא הדבר
-- היחיד שממשיך להגן על המשבצת מפני הזמנת כרטיסייה רגילה של מטפלת אחרת
-- (create_booking כן בודק room_blocks). לכן: **אסור** למחוק את הבלוק בזמן
-- הקליטה עצמה — רק כשהתשלום מתקבל בפועל וה-bookings האמיתיים כבר קיימים
-- (materialize_subscription_bookings), הבלוק הישן הופך למיותר וניתן להסרה.
--
-- cleanup_skedda_import_blocks מתאימה בלוק לחיסול לפי room_id+weekday+שעה
-- מדויקים (לא לפי טקסט/שם — אין matching מבוסס שם בשום מקום בקוד), ונקראת
-- אוטומטית בסוף שני מסלולי ההפעלה הראשונית של ססיה (Woo + מזומן ע"י אדמין).
-- חידושים חודשיים לא נוגעים כאן — עד אז הבלוקים כבר לא רלוונטיים.

create or replace function cleanup_skedda_import_blocks(p_subscription_id uuid)
returns void as $$
declare
  v_slot record;
  v_deleted int;
  v_total_deleted int := 0;
begin
  perform assert_service_or_admin();

  for v_slot in select * from session_slots where subscription_id = p_subscription_id loop
    delete from room_blocks
    where room_id = v_slot.room_id
      and reason ilike '%הועבר מ-Skedda%'
      and extract(dow from (starts_at at time zone 'Asia/Jerusalem'))::int = v_slot.weekday
      and (starts_at at time zone 'Asia/Jerusalem')::time = v_slot.start_time
      and (ends_at at time zone 'Asia/Jerusalem')::time = v_slot.end_time;
    get diagnostics v_deleted = row_count;
    v_total_deleted := v_total_deleted + v_deleted;
  end loop;

  if v_total_deleted > 0 then
    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (null, 'skedda_blocks_cleaned_up', 'session_subscriptions', p_subscription_id,
            jsonb_build_object('blocks_deleted', v_total_deleted));
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ הפעלת ססיה בעקבות תשלום דרך Woo — כנ"ל, בתוספת ניקוי Skedda ═══
create or replace function activate_session_payment(
  p_payment_id uuid,
  p_transaction_uid text,
  p_method payment_method,
  p_token_uid text default null,
  p_card_last4 text default null,
  p_card_expiry text default null,
  p_invoice_url text default null
)
returns void as $$
declare
  v_payment payments%rowtype;
begin
  perform assert_service_or_admin();

  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = 'paid' then
    return; -- אידמפוטנטיות
  end if;

  if v_payment.type <> 'session_initial' or v_payment.subscription_id is null then
    raise exception 'INVALID_PAYMENT_TYPE';
  end if;

  update payments
  set status = 'paid',
      method = p_method,
      payplus_transaction_uid = p_transaction_uid,
      invoice_url = coalesce(p_invoice_url, invoice_url),
      paid_at = now()
  where id = p_payment_id;

  if p_token_uid is not null then
    perform set_config('baclinica.trusted_write', 'on', true);
    update profiles
    set payplus_token_uid = p_token_uid,
        card_last4 = coalesce(p_card_last4, card_last4),
        card_expiry = coalesce(p_card_expiry, card_expiry)
    where id = v_payment.user_id;
    perform set_config('baclinica.trusted_write', 'off', true);
  end if;

  update session_subscriptions
  set status = 'active',
      start_date = coalesce(start_date, current_date),
      next_billing_date = coalesce(start_date, current_date) + interval '1 month'
  where id = v_payment.subscription_id;

  perform materialize_subscription_bookings(v_payment.subscription_id, 90);
  perform cleanup_skedda_import_blocks(v_payment.subscription_id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_payment.user_id, 'session_activated', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer set search_path = public;

-- ═══ הפעלת ססיה בתשלום מזומן — כנ"ל, בתוספת ניקוי Skedda ═══
create or replace function admin_activate_session_cash_payment(
  p_payment_id uuid,
  p_method payment_method,
  p_transaction_uid text
) returns void as $$
declare
  v_payment payments%rowtype;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = 'paid' then
    return; -- אידמפוטנטיות
  end if;

  if v_payment.type <> 'session_initial' or v_payment.subscription_id is null then
    raise exception 'INVALID_PAYMENT_TYPE';
  end if;

  update payments
  set status = 'paid',
      method = p_method,
      payplus_transaction_uid = p_transaction_uid,
      paid_at = now()
  where id = p_payment_id;

  update session_subscriptions
  set status = 'active',
      start_date = coalesce(start_date, current_date),
      next_billing_date = coalesce(start_date, current_date) + interval '1 month'
  where id = v_payment.subscription_id;

  perform materialize_subscription_bookings(v_payment.subscription_id, 90);
  perform cleanup_skedda_import_blocks(v_payment.subscription_id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'session_activated_manually', 'session_subscriptions', v_payment.subscription_id,
          jsonb_build_object('payment_id', p_payment_id, 'method', p_method, 'transaction_uid', p_transaction_uid));
end;
$$ language plpgsql security definer set search_path = public;
