import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * יעד הקישורים שנשלחים במייל ע"י Supabase — אימות הרשמה ואיפוס סיסמה.
 * מקבל שני פורמטים:
 *
 * 1. `token_hash` + `type` — התבנית המומלצת, ועובדת גם כשפותחים את המייל
 *    במכשיר אחר מזה שממנו נרשמו (למשל נרשמים במחשב ופותחים את המייל בנייד).
 * 2. `code` — זרימת PKCE. עובדת רק באותו דפדפן שיזם את הבקשה, כי ה-verifier
 *    שמור אצלו. נשארת כאן לתאימות אחורה.
 *
 * `next` קובע לאן ממשיכים אחרי שהסשן נוצר (אימות הרשמה → /login כדי להשלים
 * פרטים; איפוס סיסמה → /reset-password).
 */

/** מונע open redirect: רק נתיב יחסי בתוך האתר עצמו. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/login";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
