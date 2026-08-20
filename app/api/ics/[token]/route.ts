import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCalendarFeed, type IcsEvent } from "@/lib/ics";
import { isoDaysAgo } from "@/lib/time";

// פיד ICS אישי — §8.7 "סנכרון יומן: קישור ICS אישי". ציבורי בכוונה: אפליקציות
// יומן (גוגל/אפל) מושכות אותו בלי session, האימות הוא ה-token הבלתי-ניתן-
// לניחוש עצמו (profiles.ics_token, uuid). משום כך משתמשים ב-admin client —
// אין session לאמת מולה RLS, והטוקן הוא שכבת ההרשאה.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("ics_token", token)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, room_id, starts_at, ends_at, source, status")
    .eq("user_id", profile.id)
    .eq("status", "confirmed")
    .gte("starts_at", isoDaysAgo(1))
    .order("starts_at");

  const roomIds = [...new Set((bookings ?? []).map((b) => b.room_id))];
  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, name, branch_id").in("id", roomIds)
    : { data: [] };
  const branchIds = [...new Set((rooms ?? []).map((r) => r.branch_id))];
  const { data: branches } = branchIds.length
    ? await supabase.from("branches").select("id, name").in("id", branchIds)
    : { data: [] };

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const roomById = new Map(
    (rooms ?? []).map((r) => [r.id, { name: r.name, branch: branchNameById.get(r.branch_id) ?? "" }]),
  );

  const events: IcsEvent[] = (bookings ?? []).map((b) => {
    const room = roomById.get(b.room_id);
    return {
      uid: `booking-${b.id}@baclinica.co.il`,
      summary: `בקליניקה — ${room?.name ?? "חדר"}`,
      location: room ? `${room.name}, ${room.branch}` : undefined,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
    };
  });

  const ics = generateCalendarFeed(events, `בקליניקה — ${profile.full_name}`);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="baclinica.ics"',
      "Cache-Control": "no-store",
    },
  });
}
