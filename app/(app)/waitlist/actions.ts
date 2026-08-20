"use server";

import { z } from "zod";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const waitlistSchema = z.object({
  branchId: z.string().uuid(),
  roomId: z.string().uuid().optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function joinWaitlistAction(formValues: unknown): Promise<ActionResult> {
  const { userId } = await requireTherapistProfile();
  const parsed = waitlistSchema.safeParse(formValues);
  if (!parsed.success) return { ok: false, error: "פרטים לא תקינים" };
  const { branchId, roomId, date, startTime, endTime } = parsed.data;

  if (endTime <= startTime) return { ok: false, error: "שעת הסיום חייבת להיות אחרי ההתחלה" };

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({
    user_id: userId,
    branch_id: branchId,
    room_id: roomId || null,
    date,
    start_time: startTime,
    end_time: endTime,
  });

  if (error) return { ok: false, error: "ההרשמה לרשימת ההמתנה נכשלה" };
  return { ok: true };
}

export async function leaveWaitlistAction(waitlistId: string): Promise<ActionResult> {
  const { userId } = await requireTherapistProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").delete().eq("id", waitlistId).eq("user_id", userId);
  if (error) return { ok: false, error: "ההסרה נכשלה" };
  return { ok: true };
}
