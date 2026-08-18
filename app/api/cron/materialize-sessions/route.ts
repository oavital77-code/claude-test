import { NextResponse } from "next/server";

// יומי 03:00 — materialize_session_bookings(), רולינג 90 יום. ר' spec §6.6.
// TODO (M5)
export async function GET() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
