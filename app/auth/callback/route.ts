import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmPagePath, parseOtpType, safeNext } from "@/lib/auth/email-link";

/**
 * יעד הקישורים שנשלחים במייל ע"י Supabase — אימות הרשמה ואיפוס סיסמה.
 * מקבל שני פורמטים:
 *
 * 1. `token_hash` + `type` — התבנית המומלצת, ועובדת גם כשפותחים את המייל
 *    במכשיר אחר מזה שממנו נרשמו. **לא מנוצל כאן** (GET) — מועבר לדף
 *    /auth/confirm עם כפתור, והניצול קורה רק בלחיצה. ר' lib/auth/email-link.ts.
 * 2. `code` — זרימת PKCE. עובדת רק באותו דפדפן שיזם את הבקשה, כי ה-verifier
 *    שמור אצלו. נשארת כאן לתאימות אחורה.
 *
 * `next` קובע לאן ממשיכים אחרי שהסשן נוצר (אימות הרשמה → /login כדי להשלים
 * פרטים; איפוס סיסמה → /reset-password).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));

  const tokenHash = searchParams.get("token_hash");
  const type = parseOtpType(searchParams.get("type"));
  if (tokenHash && type) {
    return NextResponse.redirect(`${origin}${confirmPagePath(tokenHash, type, next)}`);
  }

  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
