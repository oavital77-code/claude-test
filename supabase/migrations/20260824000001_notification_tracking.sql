-- בקליניקה — עמודות מעקב התראות (M7)
-- מונעות שליחה חוזרת יומית של אותה התראה (יתרה נמוכה / כרטיסייה פגה /
-- תזכורת) ע"י ה-cron היומי. ר' baclinica-spec.md §10.

alter table punch_cards
  add column low_balance_notified_at timestamptz,
  add column expiry_notified_at timestamptz;

alter table bookings
  add column reminder_sent_at timestamptz;
