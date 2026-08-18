-- בקליניקה — פעולות אדמין על מטפלים: השלמת פיקדון, שעות מתנה (M6, §9)

-- ═══ השלמת פיקדון ידנית (למשל אחרי העברה בנקאית מחוץ למערכת) ═══
create or replace function admin_complete_deposit(p_punch_card_id uuid)
returns void as $$
declare
  v_card punch_cards%rowtype;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_card from punch_cards where id = p_punch_card_id for update;
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  update punch_cards set deposit_remaining = deposit_amount where id = p_punch_card_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'deposit_completed_manually', 'punch_cards', p_punch_card_id,
          jsonb_build_object('deposit_amount', v_card.deposit_amount));
end;
$$ language plpgsql security definer;

-- ═══ הענקת שעות מתנה — כרטיסייה ללא תשלום, פיקדון 0 (משלים אוטומטית) ═══
create or replace function grant_bonus_hours(p_user_id uuid, p_hours numeric, p_note text)
returns table (punch_card_id uuid) as $$
declare
  v_card_id uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_hours is null or p_hours <= 0 then
    raise exception 'INVALID_SLOT';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  insert into punch_cards (
    user_id, tier_id, hours_purchased, hours_remaining,
    price_per_hour, deposit_amount, deposit_remaining, expires_at, active
  ) values (
    p_user_id, null, p_hours, p_hours, 0, 0, 0, now() + interval '24 months', true
  ) returning id into v_card_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'bonus_hours_granted', 'punch_cards', v_card_id,
          jsonb_build_object('user_id', p_user_id, 'hours', p_hours, 'note', p_note));

  return query select v_card_id;
end;
$$ language plpgsql security definer;
