import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// cleana.co.il          → ממשק מטפלים, ב-app/(app), נתיבים ללא קידומת
// admin.cleana.co.il    → פאנל ניהול, ב-app/(admin)/admin, מיושר ל-/admin/*
//                          (מתוכנן — טרם הופעל בפרודקשן; האדמין מגיע כרגע דרך /admin/* ישיר)
// בסביבת פיתוח (localhost) אפשר לגשת ישירות ל-/admin בלי rewrite.
const ADMIN_HOST_PREFIX = "admin.";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const url = request.nextUrl.clone();

  if (host.startsWith(ADMIN_HOST_PREFIX) && !url.pathname.startsWith("/admin")) {
    url.pathname = `/admin${url.pathname}`;
  }

  let response = NextResponse.rewrite(url);

  // מרענן את ה-session cookie של Supabase בכל בקשה (נדרש ב-App Router).
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.rewrite(url);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

// ה-middleware מרענן session — כלומר משלם round-trip ל-Auth של Supabase בכל
// בקשה שהוא תופס. לכן הוא מוחרג מכל מה שאינו ניווט: קבצי build, ה-service
// worker, ה-manifest והאייקונים. ב-PWA אלה כמה בקשות בכל פתיחת אפליקציה,
// וכולן שילמו עד היום את אותו round-trip בלי צורך.
// בונוס: /icon, /apple-icon ו-/manifest.webmanifest יושבים ב-app/ (לא בתוך
// (admin)), אז ה-rewrite לפי host היה שולח אותם ב-admin ל-/admin/icon שלא קיים.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|sw\\.js|manifest\\.webmanifest|icon|apple-icon).*)",
  ],
};
