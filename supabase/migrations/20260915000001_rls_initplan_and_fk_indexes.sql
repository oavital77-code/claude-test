-- ביצועים לקראת 60+ מטפלים — שני ממצאים מה-advisor של Supabase.
--
-- 1. auth_rls_initplan (WARN, 9 מדיניות): `auth.uid()` ו-`is_admin()` בתוך
--    מדיניות RLS מוערכים מחדש לכל שורה. עטיפה ב-`(select ...)` הופכת אותם
--    ל-InitPlan שרץ פעם אחת לשאילתה. הסמנטיקה זהה לחלוטין — רק הביצועים
--    משתנים. ר' https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- 2. unindexed_foreign_keys (INFO, 20 מפתחות): FK בלי אינדקס מאט JOIN,
--    ומאט גם DELETE/UPDATE בטבלת האב (Postgres סורק את הבן בכל פעם).
--    הבולטים: bookings.punch_card_id (כל חיוב/זיכוי), session_subscriptions.user_id,
--    session_slots.subscription_id (materialize רץ עליהם כל לילה).

-- ═══ 1. RLS: auth.uid() / is_admin() כ-InitPlan ═══

drop policy if exists own_profile on profiles;
create policy own_profile on profiles for select
  using (id = (select auth.uid()) or (select is_admin()));

drop policy if exists edit_profile on profiles;
create policy edit_profile on profiles for update
  using (id = (select auth.uid()) or (select is_admin()));

drop policy if exists admin_insert_profile on profiles;
create policy admin_insert_profile on profiles for insert
  with check (id = (select auth.uid()) or (select is_admin()));

drop policy if exists own_bookings on bookings;
create policy own_bookings on bookings for select
  using (user_id = (select auth.uid()) or (select is_admin()));

drop policy if exists own_cards on punch_cards;
create policy own_cards on punch_cards for select
  using (user_id = (select auth.uid()) or (select is_admin()));

drop policy if exists own_subs on session_subscriptions;
create policy own_subs on session_subscriptions for select
  using (user_id = (select auth.uid()) or (select is_admin()));

drop policy if exists own_slots on session_slots;
create policy own_slots on session_slots for select
  using (exists (
    select 1 from session_subscriptions s
    where s.id = session_slots.subscription_id
      and (s.user_id = (select auth.uid()) or (select is_admin()))
  ));

drop policy if exists own_pays on payments;
create policy own_pays on payments for select
  using (user_id = (select auth.uid()) or (select is_admin()));

drop policy if exists own_over on overrun_charges;
create policy own_over on overrun_charges for select
  using (user_id = (select auth.uid()) or (select is_admin()));

-- ═══ 2. אינדקסים על מפתחות זרים ═══

create index if not exists audit_log_actor_id_idx              on audit_log (actor_id);
create index if not exists availability_events_room_id_idx    on availability_events (room_id);
create index if not exists bookings_cancelled_by_idx           on bookings (cancelled_by);
create index if not exists bookings_punch_card_id_idx          on bookings (punch_card_id);
create index if not exists bookings_subscription_id_idx        on bookings (subscription_id);
create index if not exists overrun_charges_booking_id_idx      on overrun_charges (booking_id);
create index if not exists overrun_charges_payment_id_idx      on overrun_charges (payment_id);
create index if not exists overrun_charges_recorded_by_idx     on overrun_charges (recorded_by);
create index if not exists overrun_charges_user_id_idx         on overrun_charges (user_id);
create index if not exists payments_punch_card_id_idx          on payments (punch_card_id);
create index if not exists payments_subscription_id_idx        on payments (subscription_id);
create index if not exists punch_cards_tier_id_idx             on punch_cards (tier_id);
create index if not exists room_blocks_created_by_idx          on room_blocks (created_by);
create index if not exists session_slots_subscription_id_idx   on session_slots (subscription_id);
create index if not exists session_subscriptions_reviewed_by_idx on session_subscriptions (reviewed_by);
create index if not exists session_subscriptions_user_id_idx   on session_subscriptions (user_id);
create index if not exists therapist_admin_notes_updated_by_idx on therapist_admin_notes (updated_by);
create index if not exists woo_pending_purchases_claimed_by_idx on woo_pending_purchases (claimed_by);
create index if not exists woo_pending_purchases_tier_id_idx   on woo_pending_purchases (tier_id);
create index if not exists woo_product_tiers_tier_id_idx       on woo_product_tiers (tier_id);
