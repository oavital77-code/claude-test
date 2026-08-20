import { NextRequest, NextResponse } from "next/server";

// app.baclinica.co.il  → ממשק מטפלים, ב-app/(app), נתיבים ללא קידומת
// admin.baclinica.co.il → פאנל ניהול, ב-app/(admin)/admin, מיושר ל-/admin/*
// בסביבת פיתוח (localhost) אפשר לגשת ישירות ל-/admin בלי rewrite.
const ADMIN_HOST_PREFIX = "admin.";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const url = request.nextUrl.clone();

  if (host.startsWith(ADMIN_HOST_PREFIX) && !url.pathname.startsWith("/admin")) {
    url.pathname = `/admin${url.pathname}`;
  }

  // DIAGNOSTIC TEMP: Supabase session-refresh call removed to isolate a
  // "__dirname is not defined" Edge Runtime crash on Vercel that does not
  // reproduce locally. Restore before real use — auth session won't refresh
  // without this.
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
