import { NextResponse } from "next/server";

// כל 15 דק' — סנכרון תשלומים 'pending' מעל 15 דק' מול PayPlus (callback אבוד). ר' spec §13.
// TODO (M3)
export async function GET() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
