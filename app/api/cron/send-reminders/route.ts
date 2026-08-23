import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { bookingReminderEmail, lowBalanceEmail, cardExpiringEmail, sessionRenewalReminderEmail } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";
import { accessWindow } from "@/lib/time";
import { dayBoundaries, todayInIsrael, addDaysToDateStr } from "@/lib/availability/grid";
import { withCronAlert } from "@/lib/cron/guard";

// יומי 09:00 — תזכורות 24 שעות לפני + התראות יתרה נמוכה/כרטיסייה פגה +
// תזכורת חידוש ססיה (7 ימים מראש, למטפל/ת ולהנהלה). ר' spec §10.
// כל התראה מסומנת עם *_notified_at כדי שלא תישלח שוב בכל ריצה (§20260824000001).
export const GET = withCronAlert("send-reminders", async () => {
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

  // תזכורת חידוש ססיה — 7 ימים לפני next_billing_date, למטפל/ת ולהנהלה
  const in7Days = addDaysToDateStr(today, 7);
  let sessionReminders = 0;
  const { data: expiringSubs } = await supabase
    .from("session_subscriptions")
    .select("id, user_id, weekly_hours, next_billing_date")
    .eq("status", "active")
    .is("renewal_reminder_sent_at", null)
    .not("next_billing_date", "is", null)
    .lte("next_billing_date", in7Days)
    .gte("next_billing_date", today);

  if (expiringSubs && expiringSubs.length > 0) {
    const adminEmails = await getAdminEmails(supabase);
    for (const sub of expiringSubs) {
      if (!sub.next_billing_date) continue;
      const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", sub.user_id).maybeSingle();
      if (!profile) continue;

      const nextBillingDate = new Date(sub.next_billing_date);
      const therapistEmail = sessionRenewalReminderEmail({
        therapistName: profile.full_name,
        weeklyHours: sub.weekly_hours,
        nextBillingDate,
        forAdmin: false,
      });
      const adminEmail = sessionRenewalReminderEmail({
        therapistName: profile.full_name,
        weeklyHours: sub.weekly_hours,
        nextBillingDate,
        forAdmin: true,
      });

      const results = await Promise.all([
        sendEmail({ to: profile.email, subject: therapistEmail.subject, html: therapistEmail.html }),
        adminEmails.length > 0
          ? sendEmail({ to: adminEmails, subject: adminEmail.subject, html: adminEmail.html })
          : Promise.resolve({ ok: true as const }),
      ]);

      if (results.every((r) => r.ok)) {
        await supabase
          .from("session_subscriptions")
          .update({ renewal_reminder_sent_at: new Date().toISOString() })
          .eq("id", sub.id);
        sessionReminders++;
      }
    }
  }

  return NextResponse.json({ reminders, lowBalance, expiring, sessionReminders });
});
