"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateAppSettingAction(key: string, value: number): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.number().finite().safeParse(value);
  if (!parsed.success) return { ok: false, error: "ערך לא תקין" };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update({ value: parsed.data }).eq("key", key);
  if (error) return { ok: false, error: "השמירה נכשלה" };
  return { ok: true };
}

export type ResetSystemResult =
  | {
      ok: true;
      therapists: number;
      bookings: number;
      rooms: number;
      branches: number;
    }
  | { ok: false; error: string };

/**
 * ⚠️ הרסני ובלתי הפיך. ר' 20260914000001_reset_system_to_zero.sql —
 * הבדיקות האמיתיות (אדמין, מילת אישור, נעילה אחרי השקה) נאכפות בתוך ה-RPC
 * עצמו, לא כאן, כדי שלא יהיה שום מסלול לעקוף אותן.
 */
export async function resetSystemToZeroAction(confirmation: string): Promise<ResetSystemResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_system_to_zero", {
    p_confirmation: confirmation,
  });

  if (error) {
    const code = error.message ?? "";
    if (code.includes("RESET_LOCKED")) {
      return {
        ok: false,
        error: "האיפוס נעול: כבר בוצע במערכת תשלום אמיתי ע\"י משתמש/ת. לא ניתן למחוק מערכת פעילה.",
      };
    }
    if (code.includes("INVALID_CONFIRMATION")) {
      return { ok: false, error: "מילת האישור שהוקלדה אינה נכונה" };
    }
    if (code.includes("FORBIDDEN")) {
      return { ok: false, error: "אין לך הרשאה לבצע איפוס" };
    }
    return { ok: false, error: "האיפוס נכשל. שום דבר לא נמחק." };
  }

  const summary = data as {
    therapists_deleted: number;
    bookings_deleted: number;
    rooms_deleted: number;
    branches_deleted: number;
  };

  return {
    ok: true,
    therapists: summary.therapists_deleted,
    bookings: summary.bookings_deleted,
    rooms: summary.rooms_deleted,
    branches: summary.branches_deleted,
  };
}

export async function updateTierPriceAction(
  tierId: string,
  pricePerHour: number,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.number().positive().safeParse(pricePerHour);
  if (!parsed.success) return { ok: false, error: "מחיר לא תקין" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("punch_card_tiers")
    .update({ price_per_hour: parsed.data })
    .eq("id", tierId);
  if (error) return { ok: false, error: "השמירה נכשלה" };
  return { ok: true };
}
