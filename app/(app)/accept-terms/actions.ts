"use server";

import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/terms/current";

export type AcceptTermsResult = { ok: false; error: string };

/** אישור תקנון בכניסה ראשונה לחשבון שנפתח מראש (ר' requireTherapistProfile). */
export async function acceptTermsAction(accepted: boolean): Promise<AcceptTermsResult> {
  if (accepted !== true) return { ok: false, error: "יש לאשר את תקנון השירות" };
  const { userId, profile } = await getAuthState();
  if (!userId || !profile) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION })
    .eq("id", userId);
  if (error) return { ok: false, error: "השמירה נכשלה. נסו שוב." };

  redirect("/");
}
