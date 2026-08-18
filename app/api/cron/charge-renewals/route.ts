import { NextResponse } from "next/server";

// יומי 06:00 — charge_session_renewals(). ר' spec §6.7.
// TODO (M5)
export async function GET() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
