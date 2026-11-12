import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveCleanaPlusConnection } from "@/lib/cleana-plus/connection";
import {
  STATE_COOKIE,
  cleanaPlusConfig,
  exchangeCode,
  stateMatches,
  validCode,
  validState,
} from "@/lib/cleana-plus/oauth";

export const dynamic = "force-dynamic";

// שלב 3 בחיבור ל-Cleana+ (ר' lib/cleana-plus/oauth.ts): Cleana+ מחזירה לכאן
// את הדפדפן עם code + state. מאמתים state, מחליפים את ה-code במפתח
// (שרת-לשרת) ושומרים מוצפן. תמיד חוזרים ל-/profile עם תוצאה ב-query.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/profile?cleana_plus=${result}`, origin), 303);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/cleana-plus" });
    res.headers.set("Cache-Control", "no-store");
    return res;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin), 303);

  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  if (!validState(state) || !stateMatches(request.cookies.get(STATE_COOKIE)?.value, state, user.id)) {
    return back("expired");
  }
  if (params.get("error")) return back("denied");

  const code = params.get("code");
  const config = cleanaPlusConfig();
  if (!config) return back("unavailable");
  if (!validCode(code)) return back("error");

  const exchanged = await exchangeCode(config, code);
  if (!exchanged.ok) return back(exchanged.reason === "unavailable" ? "unavailable" : "error");

  const saved = await saveCleanaPlusConnection(user.id, exchanged.accessToken, exchanged.accountLabel);
  return back(saved ? "connected" : "error");
}
