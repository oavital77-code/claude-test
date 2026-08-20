-- בקליניקה — Row Level Security (M0)
-- ר' baclinica-spec.md §5.4

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer stable;

alter table profiles              enable row level security;
alter table bookings              enable row level security;
alter table punch_cards           enable row level security;
alter table session_subscriptions enable row level security;
alter table session_slots         enable row level security;
alter table payments              enable row level security;
alter table overrun_charges       enable row level security;
alter table waitlist              enable row level security;
alter table room_blocks           enable row level security;
alter table branches              enable row level security;
alter table rooms                 enable row level security;
alter table app_settings          enable row level security;
alter table punch_card_tiers      enable row level security;
alter table audit_log             enable row level security;

-- פרופיל: רואה רק את עצמו (בלי admin_notes — ייחשף ב-view נפרד בעת הצורך)
create policy own_profile on profiles for select using (id = auth.uid() or is_admin());
create policy edit_profile on profiles for update using (id = auth.uid() or is_admin());
create policy admin_insert_profile on profiles for insert with check (id = auth.uid() or is_admin());

-- הזמנות: רואה רק את שלו. אחרים — דרך public_availability בלבד (§5.3)
create policy own_bookings on bookings for select using (user_id = auth.uid() or is_admin());

-- יצירה ועדכון: אך ורק דרך RPC (SECURITY DEFINER). אין INSERT/UPDATE ישיר מהאפליקציה.
create policy no_direct_insert on bookings for insert with check (is_admin());
create policy no_direct_update on bookings for update using (is_admin());

create policy own_cards   on punch_cards           for select using (user_id = auth.uid() or is_admin());
create policy own_subs    on session_subscriptions for select using (user_id = auth.uid() or is_admin());
create policy own_slots   on session_slots for select using (
  exists (
    select 1 from session_subscriptions s
    where s.id = subscription_id and (s.user_id = auth.uid() or is_admin())
  )
);
create policy own_pays    on payments              for select using (user_id = auth.uid() or is_admin());
create policy own_over    on overrun_charges       for select using (user_id = auth.uid() or is_admin());
create policy own_wait    on waitlist              for all    using (user_id = auth.uid() or is_admin());

-- חסימות תחזוקה: פרטים מלאים לאדמין בלבד. זמינות למטפל — דרך public_availability.
create policy admin_room_blocks on room_blocks for all using (is_admin());

-- טבלאות ציבוריות לקריאה
create policy read_branches on branches for select using (active or is_admin());
create policy read_rooms    on rooms    for select using (active or is_admin());
create policy read_tiers    on punch_card_tiers for select using (active or is_admin());
create policy read_settings on app_settings for select using (true);

-- ניהול (CRUD) על סניפים/חדרים/מדרגות/הגדרות — אדמין בלבד
create policy admin_write_branches on branches for insert with check (is_admin());
create policy admin_update_branches on branches for update using (is_admin());
create policy admin_write_rooms on rooms for insert with check (is_admin());
create policy admin_update_rooms on rooms for update using (is_admin());
create policy admin_write_tiers on punch_card_tiers for insert with check (is_admin());
create policy admin_update_tiers on punch_card_tiers for update using (is_admin());
create policy admin_write_settings on app_settings for insert with check (is_admin());
create policy admin_update_settings on app_settings for update using (is_admin());

-- יומן ביקורת: קריאה לאדמין בלבד. כתיבה רק מפונקציות SECURITY DEFINER.
create policy admin_read_audit on audit_log for select using (is_admin());

grant select on public_availability to authenticated;
