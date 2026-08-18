"use server";

import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";

export type BookSlotResult =
  | { ok: true; hoursCharged: number; hoursRemaining: number }
  | { ok: false; error: string };

export async function bookSlot(
  roomId: string,
  startsAt: string,
  endsAt: string,
): Promise<BookSlotResult> {
  await requireTherapistProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_booking", { p_room_id: roomId, p_starts_at: startsAt, p_ends_at: endsAt })
    .single();

  if (error || !data) {
    return { ok: false, error: bookingErrorMessage(error?.message) };
  }

  return { ok: true, hoursCharged: data.hours_charged, hoursRemaining: data.hours_remaining };
}
