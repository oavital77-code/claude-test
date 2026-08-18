"use server";

import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";

export type CancelBookingResult =
  | { ok: true; hoursRefunded: boolean }
  | { ok: false; error: string };

export async function cancelBookingAction(bookingId: string): Promise<CancelBookingResult> {
  await requireTherapistProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("cancel_booking", { p_booking_id: bookingId })
    .single();

  if (error || !data) {
    return { ok: false, error: bookingErrorMessage(error?.message) };
  }

  return { ok: true, hoursRefunded: data.hours_refunded };
}
