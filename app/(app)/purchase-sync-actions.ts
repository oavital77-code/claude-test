"use server";

import { z } from "zod";
import { getAuthState } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { pollWooOrders } from "@/lib/woo/poll";

const inputSchema = z.object({ sinceIso: z.string().datetime() });

/**
 * בדיקה מיידית של רכישות חדשות למטפל/ת — נקראת מהדפדפן כשהמערכת נפתחת
 * וכשחוזרים ללשונית (אחרי תשלום בחנות שנפתחה בלשונית אחרת). מחזירה את
 * הכרטיסיות שנזקפו מאז `sinceIso`, כדי שהמסך יתעדכן מיד ויוצג "נוספו X שעות".
 *
 * סדר: poll מול החנות (מגבלת קצב גלובלית 10 שניות) → זקיפת רכישות ממתינות
 * → יתרת Skedda → שליפת כרטיסיות חדשות. כרטיסייה שנזקפה ע"י ה-webhook לפני
 * הקריאה נכללת גם היא (לפי purchased_at), כך שאין מרוץ מול ה-webhook.
 */
export async function syncMyPurchases(input: { sinceIso: string }): Promise<{ addedHours: number; cardIds: string[] }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { addedHours: 0, cardIds: [] };

  const { userId, profile } = await getAuthState();
  if (!userId || !profile || profile.role !== "therapist") return { addedHours: 0, cardIds: [] };

  const supabase = await createClient();

  await pollWooOrders(90, { throttleSeconds: 10 }).catch((e: unknown) => {
    console.error("[woo] בדיקת רכישות מיידית נכשלה:", e instanceof Error ? e.message : e);
  });
  try {
    await supabase.rpc("claim_woo_pending_purchase");
  } catch {
    // best-effort — ה-cron היומי ינסה שוב
  }
  try {
    await supabase.rpc("claim_skedda_balance");
  } catch {
    // best-effort
  }

  const { data: cards } = await supabase
    .from("punch_cards")
    .select("id, hours_purchased")
    .eq("user_id", userId)
    .gt("purchased_at", parsed.data.sinceIso);

  return {
    addedHours: (cards ?? []).reduce((sum, c) => sum + Number(c.hours_purchased), 0),
    cardIds: (cards ?? []).map((c) => c.id),
  };
}
