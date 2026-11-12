-- חיבור חשבון Cleana+ של מטפל/ת (אפיון "סנכרון Cleana ↔ Cleana+", שלב 1).
--
-- שורה אחת לכל מטפל/ת מחובר/ת. access_token_ciphertext = המפתח האישי
-- ש-Cleana+ הנפיקה, מוצפן AES-256-GCM בצד השרת (lib/cleana-plus/crypto.ts,
-- CLEANA_PLUS_TOKEN_KEY). המפתח מאפשר רק לפתוח/לסגור משבצות של אותו/ה
-- מטפל/ת ב-Cleana+.
--
-- 🔒 RLS פעיל בלי שום policy: אף משתמש (גם לא הבעלים) לא קורא את הטבלה דרך
-- PostgREST. רק קוד השרת (service role) קורא וכותב, אחרי שווידא מי מחובר/ת.
-- הדפדפן לומד רק "מחובר/לא מחובר" ותאריך — לעולם לא את המפתח.
create table if not exists cleana_plus_connections (
  therapist_id uuid primary key references profiles(id) on delete cascade,
  access_token_ciphertext text not null,
  -- המייל של החשבון ב-Cleana+ (כפי ש-Cleana+ החזירה), כדי להראות למטפל/ת
  -- לאיזה חשבון חובר/ה. לא נשלח לשום מקום.
  account_label text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cleana_plus_connections enable row level security;
-- אין policies בכוונה — ר' למעלה.
