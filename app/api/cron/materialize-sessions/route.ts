import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// יומי 03:00 — materialize_session_bookings(), רולינג 90 יום. ר' spec §6.6.
export async function GET() {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("materialize_session_bookings");
  if (error) {
    return NextResponse.json({ error: "MATERIALIZE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
