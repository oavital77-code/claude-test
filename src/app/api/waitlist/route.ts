import { NextRequest, NextResponse } from "next/server";

const NOTIFY_EMAIL = process.env.WAITLIST_NOTIFY_EMAIL || "oavital77@gmail.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Payload = {
  name?: string;
  phone?: string;
  email?: string;
};

export async function POST(req: NextRequest) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const phone = (body.phone || "").trim();
  const email = (body.email || "").trim();

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "נא להזין שם מלא" }, { status: 400 });
  }
  if (!phone || phone.replace(/\D/g, "").length < 9) {
    return NextResponse.json({ error: "נא להזין מספר טלפון תקין" }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "נא להזין כתובת אימייל תקינה" }, { status: 400 });
  }

  const lead = { name, phone, email, at: new Date().toISOString() };

  // Always log so the lead is visible in the platform's function logs
  // (e.g. Vercel > Project > Logs) even before email delivery is wired up.
  console.log("[voltsafe:waitlist]", JSON.stringify(lead));

  // Optional: forward to email via Resend, if RESEND_API_KEY is configured.
  // Without it, leads still land in the server logs above.
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || "Voltsafe Waitlist <onboarding@resend.dev>",
          to: NOTIFY_EMAIL,
          subject: "נרשם/ת חדש/ה לרשימת ההמתנה של Voltsafe",
          text: `שם: ${name}\nטלפון: ${phone}\nאימייל: ${email}\nבתאריך: ${lead.at}`,
        }),
      });
      if (!res.ok) {
        console.error("[voltsafe:waitlist] Resend error", await res.text());
      }
    } catch (err) {
      console.error("[voltsafe:waitlist] Resend request failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
