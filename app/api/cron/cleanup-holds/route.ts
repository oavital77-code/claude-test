import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCronAlert } from "@/lib/cron/guard";

// כל שעה — ניקוי holds פגי תוקף של ססיות + סגירת ביטולים שהגיעו לתאריך היעד.
// ר' spec §3.3 (hold 72 שעות), §3.4 (ביטול מנוי 30 יום מראש).
export const GET = withCronAlert("cleanup-holds", async () => {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("expire_session_holds_and_cancellations");
  if (error) {
    return NextResponse.json({ error: "CLEANUP_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
});
