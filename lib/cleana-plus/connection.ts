import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "./crypto";

// גישה לטבלת cleana_plus_connections. RLS בלי policies, אז רק service role.
// 🔒 כל פונקציה כאן מקבלת therapistId שהקורא כבר אימת מה-session — לעולם
// לא מזהה שהגיע מהדפדפן.

export type CleanaPlusStatus = { connected: false } | { connected: true; connectedAt: string; accountLabel: string | null };

export async function getCleanaPlusStatus(therapistId: string): Promise<CleanaPlusStatus> {
  const { data } = await createAdminClient()
    .from("cleana_plus_connections")
    .select("connected_at, account_label")
    .eq("therapist_id", therapistId)
    .maybeSingle();
  if (!data) return { connected: false };
  return { connected: true, connectedAt: data.connected_at, accountLabel: data.account_label };
}

export async function saveCleanaPlusConnection(
  therapistId: string,
  accessToken: string,
  accountLabel: string | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("cleana_plus_connections")
    .upsert(
      {
        therapist_id: therapistId,
        access_token_ciphertext: encryptToken(accessToken),
        account_label: accountLabel,
        connected_at: now,
        updated_at: now,
      },
      { onConflict: "therapist_id" },
    );
  return !error;
}

/** המפתח המפוענח, לשימוש בשרת בלבד (פתיחה/סגירה של משבצות, ניתוק). */
export async function getCleanaPlusToken(therapistId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("cleana_plus_connections")
    .select("access_token_ciphertext")
    .eq("therapist_id", therapistId)
    .maybeSingle();
  if (!data) return null;
  try {
    return decryptToken(data.access_token_ciphertext);
  } catch {
    return null;
  }
}

export async function deleteCleanaPlusConnection(therapistId: string): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("cleana_plus_connections")
    .delete()
    .eq("therapist_id", therapistId);
  return !error;
}
