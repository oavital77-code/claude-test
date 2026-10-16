"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseOtpType, safeNext } from "@/lib/auth/email-link";

/**
 * ניצול הקוד החד-פעמי מהמייל — רק בלחיצה על הכפתור (POST), לא בפתיחת
 * הקישור. ר' lib/auth/email-link.ts למה.
 */
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = formData.get("token_hash");
  const type = parseOtpType(String(formData.get("type") ?? ""));
  const next = safeNext(String(formData.get("next") ?? ""));

  if (typeof tokenHash !== "string" || !tokenHash || !type) {
    redirect("/login?error=auth");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect("/login?error=auth");
  redirect(next);
}
