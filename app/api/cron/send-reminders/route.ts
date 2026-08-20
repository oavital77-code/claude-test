import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { bookingReminderEmail, lowBalanceEmail, cardExpiringEmail } from "@/lib/email/templates";
import { accessWindow } from "@/lib/time";
import { dayBoundaries, todayInIsrael, addDaysToDateStr } from "@/lib/availability/grid";

// יומי 09:00 — תזכורות 24 שעות לפני + התראות יתרה נמוכה/כרטיסייה פגה. ר' spec §10.
// כל התראה מסומנת עם *_notified_at כדי שלא תישלח שוב בכל ריצה (§20260824000001).
export async function GET() {
  const supabase = createAdminClient();
  const today = todayInIsrael();
  const tomorrow = addDaysToDateStr(today, 1);
  const { start: tomorrowStart, end: tomorrowEnd } = dayBoundaries(tomorrow);
  const in30Days = dayBoundaries(addDaysToDateStr(today, 30)).start.toISOString();

  let reminders = 0;
  let lowBalance = 0;
  let expiring = 0;

  // תזכורות 24 שעות
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, user_id, room_id, starts_at, ends_at")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("starts_at", tomorrowStart.toISOString())
    .lt("starts_at", tomorrowEnd.toISOString());

  for (const b of bookings ?? []) {
    const [{ data: profile }, { data: room }] = await Promise.all([
      supabase.from("profiles").select("email").eq("id", b.user_id).maybeSingle(),
      supabase.from("rooms").select("name, branch_id").eq("id", b.room_id).maybeSingle(),
    ]);
    if (!profile || !room) continue;
    const { data: branch } = await supabase.from("branches").select("name").eq("id", room.branch_id).maybeSingle();

    const { accessStart } = accessWindow(new Date(b.starts_at), new Date(b.ends_at));
    const { subject, html } = bookingReminderEmail({
      roomName: room.name,
      branchName: branch?.name ?? "",
      startsAt: new Date(b.starts_at),
      accessStart,
    });
    const result = await sendEmail({ to: profile.email, subject, html });
    if (result.ok) {
      await supabase.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
      reminders++;
    }
  }

  // יתרה נמוכה (<= 2 שעות) — לפי סכום יתרות פעילות למטפל
  const { data: activeCards } = await supabase
    .from("punch_cards")
    .select("id, user_id, hours_remaining")
    .eq("active", true)
    .is("low_balance_notified_at", null)
    .lte("hours_remaining", 2)
    .gt("expires_at", new Date().toISOString());

  for (const card of activeCards ?? []) {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", card.user_id).maybeSingle();
    if (!profile) continue;
    const { subject, html } = lowBalanceEmail(card.hours_remaining);
    const result = await sendEmail({ to: profile.email, subject, html });
    if (result.ok) {
      await supabase.from("punch_cards").update({ low_balance_notified_at: new Date().toISOString() }).eq("id", card.id);
      lowBalance++;
    }
  }

  // כרטיסייה פגה תוך 30 יום
  const { data: expiringCards } = await supabase
    .from("punch_cards")
    .select("id, user_id, hours_remaining, expires_at")
    .eq("active", true)
    .is("expiry_notified_at", null)
    .lte("expires_at", in30Days)
    .gt("expires_at", new Date().toISOString());

  for (const card of expiringCards ?? []) {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", card.user_id).maybeSingle();
    if (!profile) continue;
    const { subject, html } = cardExpiringEmail(new Date(card.expires_at), card.hours_remaining);
    const result = await sendEmail({ to: profile.email, subject, html });
    if (result.ok) {
      await supabase.from("punch_cards").update({ expiry_notified_at: new Date().toISOString() }).eq("id", card.id);
      expiring++;
    }
  }

  return NextResponse.json({ reminders, lowBalance, expiring });
}
