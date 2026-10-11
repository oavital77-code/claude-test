-- בקליניקה — טבלת העברה מ-Skedda: יתרות שעות + פרטי ססיה לכל מטפל/ת.
--
-- רוב המטפלים עוד לא רשומים ל-Cleana, אז אי אפשר להעניק להם שעות עכשיו.
-- במקום זה כל מטפל/ת מ-Skedda מקבל/ת שורה כאן (יתרה מחושבת מהיסטוריית
-- ההזמנות, ר' OPERATIONS.md), שהאדמין עורך/ת ומשווה ידנית, וברגע שהיא
-- נרשמת — היתרה עוברת אליה אוטומטית לפי **מייל מאומת** (אותו עיקרון כמו
-- claim_woo_pending_purchase, ר' 20261011000002).
--
-- 🔒 ההעברה האוטומטית כבויה עד ההשקה (app_settings.skedda_balance_claim_enabled
-- = 0): עד אז הקליניקה עובדת ב-Skedda והמטפלות ממשיכות לנצל שעות שם — מי
-- שתירשם מוקדם ותקבל יתרה עכשיו תנצל את אותן שעות פעמיים.
--
-- ססיות לא מועברות אוטומטית בכלל (has_session): נקלטות ידנית במסך "קליטה
-- מ-Skedda" בכרטיס המטפל/ת. יתרה שלילית (מי שקנתה בחנות וניצלה חלק ב-Skedda)
-- גם נשארת לטיפול ידני — הפחתה מהכרטיסייה מהחנות.
--
-- הנתונים עצמם (שמות, מיילים, טלפונים) נטענים ישירות ל-DB ולא נשמרים כאן.

create table skedda_migration (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  skedda_product text,
  used_hours numeric,
  balance_hours numeric,             -- null = לא ידוע, דורש השלמה ידנית
  confidence text not null default 'review' check (confidence in ('high', 'medium', 'review')),
  note text,
  has_session boolean not null default false,
  session_details text,
  session_paid_until date,
  session_commitment text,
  admin_note text,
  status text not null default 'pending' check (status in ('pending', 'transferred', 'skipped')),
  claimed_by uuid references profiles(id),
  claimed_at timestamptz,
  punch_card_id uuid references punch_cards(id),
  updated_at timestamptz not null default now()
);

create unique index skedda_migration_email_key on skedda_migration (lower(email)) where email is not null;
create index skedda_migration_claimed_by_idx on skedda_migration (claimed_by);
create index skedda_migration_punch_card_id_idx on skedda_migration (punch_card_id);

alter table skedda_migration enable row level security;
create policy admin_all_skedda_migration on skedda_migration for all
  using ((select is_admin())) with check ((select is_admin()));
revoke all on skedda_migration from anon;

insert into app_settings (key, value)
select 'skedda_balance_claim_enabled', '0'::jsonb
where not exists (select 1 from app_settings where key = 'skedda_balance_claim_enabled');

-- נקרא בהרשמה ובכל טעינת עמוד (כמו claim_woo_pending_purchase). no-op עד
-- שהדגל מופעל.
create or replace function claim_skedda_balance()
returns table (hours_transferred numeric) as $$
declare
  v_profile profiles%rowtype;
  v_row skedda_migration%rowtype;
  v_card_id uuid;
begin
  select * into v_profile from profiles where id = auth.uid();
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  if coalesce((select (value#>>'{}')::numeric from app_settings where key = 'skedda_balance_claim_enabled'), 0) <> 1 then
    return query select 0::numeric;
    return;
  end if;

  select * into v_row from skedda_migration
  where status = 'pending'
    and email is not null
    and lower(email) = lower(v_profile.email)
    and not has_session
    and balance_hours is not null
    and balance_hours >= 0
  for update;
  if not found then
    return query select 0::numeric;
    return;
  end if;

  if v_row.balance_hours > 0 then
    -- כמו grant_bonus_hours: כרטיסייה בלי מדרגה ובלי מחיר — השעות כבר שולמו
    -- ב-Skedda. תוקף 12 חודשים, כמו כרטיסייה ב-Skedda.
    insert into punch_cards (
      user_id, tier_id, hours_purchased, hours_remaining,
      price_per_hour, deposit_amount, deposit_remaining, expires_at, active
    ) values (
      v_profile.id, null, v_row.balance_hours, v_row.balance_hours, 0, 0, 0, now() + interval '12 months', true
    ) returning id into v_card_id;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (v_profile.id, 'skedda_balance_transferred', 'punch_cards', v_card_id,
            jsonb_build_object('skedda_migration_id', v_row.id, 'hours', v_row.balance_hours));
  end if;

  update skedda_migration
  set status = 'transferred', claimed_by = v_profile.id, claimed_at = now(),
      punch_card_id = v_card_id, updated_at = now()
  where id = v_row.id;

  return query select v_row.balance_hours;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function claim_skedda_balance() from public, anon;
grant execute on function claim_skedda_balance() to authenticated;
