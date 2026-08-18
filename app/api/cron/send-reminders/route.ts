import { NextResponse } from "next/server";

// יומי 09:00 — תזכורות 24 שעות + התראות יתרה נמוכה. ר' spec §10.
// TODO (M7)
export async function GET() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
