import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// יעד ה-Magic Link שנשלח ע"י signInWithOtp. מחליף את ה-code (PKCE) בסשן אמיתי.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/login`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
