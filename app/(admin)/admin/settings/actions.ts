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
