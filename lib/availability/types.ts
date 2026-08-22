import type { Database } from "@/lib/supabase/types";

export type SlotStatus = "free" | "taken" | "mine" | "blocked";
export type BookingSource = Database["public"]["Tables"]["bookings"]["Row"]["source"];

export interface AvailabilityInterval {
  startsAt: Date;
  endsAt: Date;
  status: SlotStatus;
  /** מקור ההזמנה (ססיה/כרטיסייה) — קיים רק ל-status "mine", ההזמנה של המשתמש עצמו. */
  source?: BookingSource;
}
