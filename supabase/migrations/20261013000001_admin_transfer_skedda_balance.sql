-- בקליניקה — העברת יתרה מ-Skedda לחשבון ספציפי, ע"י אדמין.
--
-- עד עכשיו היתרה עברה רק כשהמטפל/ת נרשמ/ה בעצמו/ה (claim_skedda_balance,
-- מייל מאומת, כבוי עד ההשקה). הבעלים ביקש לפתוח מראש חשבון לכל מטפל/ת
-- מ-Skedda (מסך "העברה מ-Skedda" → פתיחת חשבונות), כך שהכרטיס שלו/ה ייראה
-- מלא כבר ביום ההשקה. הפונקציה הזו מבצעת את אותה העברה בדיוק — כרטיסייה בלי
-- מחיר, 12 חודשים — לחשבון שהאדמין בוחר. כוללת גם שורות עם ססיה (has_session):
-- יתרת הכרטיסייה שלהן עוברת, והססיה עצמה נשארת לקליטה ידנית מהחסימות בלוח.
-- יתרה שלילית או לא ידועה — לא מועברת (נשארת pending לטיפול ידני).

create or replace function admin_transfer_skedda_balance(p_row_id uuid, p_user_id uuid)
returns table (hours_transferred numeric) as $$
declare
  v_row skedda_migration%rowtype;
  v_card_id uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_row from skedda_migration where id = p_row_id and status = 'pending' for update;
  if not found then
    raise exception 'SKEDDA_ROW_NOT_AVAILABLE';
  end if;
  if v_row.balance_hours is null or v_row.balance_hours < 0 then
    raise exception 'SKEDDA_BALANCE_NEEDS_REVIEW';
  end if;

  if v_row.balance_hours > 0 then
    insert into punch_cards (
      user_id, tier_id, hours_purchased, hours_remaining,
      price_per_hour, deposit_amount, deposit_remaining, expires_at, active
    ) values (
      p_user_id, null, v_row.balance_hours, v_row.balance_hours, 0, 0, 0, now() + interval '12 months', true
    ) returning id into v_card_id;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(), 'skedda_balance_transferred_by_admin', 'punch_cards', v_card_id,
            jsonb_build_object('skedda_migration_id', v_row.id, 'hours', v_row.balance_hours, 'user_id', p_user_id));
  end if;

  update skedda_migration
  set status = 'transferred', claimed_by = p_user_id, claimed_at = now(),
      punch_card_id = v_card_id, updated_at = now()
  where id = v_row.id;

  return query select v_row.balance_hours;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function admin_transfer_skedda_balance(uuid, uuid) from public, anon;
grant execute on function admin_transfer_skedda_balance(uuid, uuid) to authenticated;
