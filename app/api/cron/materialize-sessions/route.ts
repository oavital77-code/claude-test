import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { materializationConflictAdminEmail } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";

// יומי 03:00 — materialize_session_bookings(), רולינג 90 יום. ר' spec §6.6.
export async function GET() {
  const supabase = createAdminClient();
  const runStartedAt = new Date().toISOString();

  const { error } = await supabase.rpc("materialize_session_bookings");
  if (error) {
    return NextResponse.json({ error: "MATERIALIZE_FAILED" }, { status: 500 });
  }

  // materialize_subscription_bookings רושם קונפליקטים ל-audit_log (במקום להפיל
  // את כל הריצה) — כאן שולפים את מה שנוצר בריצה הזו ומתריעים לאדמין (§6.6, §13).
  const { data: conflicts } = await supabase
    .from("audit_log")
    .select("entity_id, after")
    .eq("action", "session_materialization_conflict")
    .gte("created_at", runStartedAt);

  if (conflicts && conflicts.length > 0) {
    const adminEmails = await getAdminEmails(supabase);
    if (adminEmails.length > 0) {
      for (const conflict of conflicts) {
        const after = conflict.after as { room_id?: string; starts_at?: string } | null;
        if (!after?.room_id || !after?.starts_at) continue;
        const { data: room } = await supabase.from("rooms").select("name").eq("id", after.room_id).maybeSingle();
        const { subject, html } = materializationConflictAdminEmail({
          roomName: room?.name ?? after.room_id,
          startsAt: new Date(after.starts_at),
        });
        await sendEmail({ to: adminEmails, subject, html });
      }
    }
  }

  return NextResponse.json({ ok: true, conflicts: conflicts?.length ?? 0 });
}
