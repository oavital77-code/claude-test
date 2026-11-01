import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OUTBOUND_LINKS, isOutboundSlug } from "@/lib/outbound-links";

export const dynamic = "force-dynamic";

// סופר לחיצה ומפנה ליעד. הרישום רץ אחרי שההפניה נשלחה (after) — המשתמש/ת
// לא מחכה ל-DB. כשל ברישום לא חוסם את ההפניה.
export async function GET(_req: Request, { params }: { params: Promise<{ link: string }> }) {
  const { link } = await params;
  if (!isOutboundSlug(link)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const target = OUTBOUND_LINKS[link];

  // הלקוח נוצר בתוך scope הבקשה (cookies) ומשמש בתוך after().
  const supabase = await createClient();
  after(async () => {
    try {
      await supabase.rpc("record_link_click", { p_link: target.key });
    } catch {
      // best-effort
    }
  });

  const res = NextResponse.redirect(target.url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
