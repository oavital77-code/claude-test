import { NextResponse } from "next/server";

// Webhook סנכרוני מ-PayPlus. מקור האמת לתשלומים — לא ה-redirect.
// TODO (M3): אימות hash מול PAYPLUS_SECRET_KEY, עדכון payments.status,
// הפעלת כרטיסייה/ססיה. ר' baclinica-spec.md §7.3-7.4.
export async function POST() {
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
