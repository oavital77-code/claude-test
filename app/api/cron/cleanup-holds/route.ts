import { NextResponse } from "next/server";

// כל שעה — ניקוי holds פגי תוקף של ססיות (hold_expires_at עבר, status='requested'/'awaiting_payment'). ר' spec §3.3.
// TODO (M5)
export async function GET() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
