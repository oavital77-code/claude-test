import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  STATE_COOKIE,
  STATE_TTL_SECONDS,
  authorizeUrl,
  cleanaPlusConfig,
  newState,
  stateCookieValue,
} from "@/lib/cleana-plus/oauth";

export const dynamic = "force-dynamic";

// שלב 1 בחיבור ל-Cleana+ (ר' lib/cleana-plus/oauth.ts): מייצר state, שומר
// בעוגייה ומפנה למסך האישור ב-Cleana+. ה-middleware לא רץ על /api, אז
// האימות כאן.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin), 303);

  const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status === "suspended") return NextResponse.redirect(new URL("/profile", origin), 303);

  const config = cleanaPlusConfig();
  if (!config) return NextResponse.redirect(new URL("/profile?cleana_plus=unavailable", origin), 303);

  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(config, state), 303);
  res.cookies.set(STATE_COOKIE, stateCookieValue(state, user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax: העוגייה חייבת לחזור בהפניה (GET ברמה העליונה) מ-Cleana+ ל-callback.
    sameSite: "lax",
    path: "/api/cleana-plus",
    maxAge: STATE_TTL_SECONDS,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
