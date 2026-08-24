import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { AvailabilityInterval, SlotStatus } from "./types";

type Client = SupabaseClient<Database>;

export async function fetchBranches(client: Client) {
  const { data, error } = await client
    .from("branches")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return data;
}

export async function fetchRooms(client: Client, branchId: string) {
  const { data, error } = await client
    .from("rooms")
    .select("*")
    .eq("branch_id", branchId)
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return data;
}

/**
 * ממזג את public_availability (זמינות אנונימית, כל המטפלים) עם ההזמנות של המשתמש
 * הנוכחי (own_bookings RLS) כדי לקבוע אילו משבצות "תפוסות" שייכות לו ("mine").
 * ר' spec §3.8, §5.3.
 */
export async function fetchRoomAvailability(
  client: Client,
  roomIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
  currentUserId: string,
): Promise<Map<string, AvailabilityInterval[]>> {
  const byRoom = new Map<string, AvailabilityInterval[]>();
  if (roomIds.length === 0) return byRoom;

  const [{ data: pub, error: pubError }, { data: mine, error: mineError }] = await Promise.all([
    client
      .from("public_availability")
      .select("*")
      .in("room_id", roomIds)
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
    client
      .from("bookings")
      .select("room_id, starts_at, ends_at, source")
      .in("room_id", roomIds)
      .eq("user_id", currentUserId)
      .eq("status", "confirmed")
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
  ]);

  if (pubError) throw pubError;
  if (mineError) throw mineError;

  const mineSourceByKey = new Map(
    (mine ?? []).map((b) => [`${b.room_id}|${b.starts_at}|${b.ends_at}`, b.source]),
  );

  for (const row of pub ?? []) {
    const key = `${row.room_id}|${row.starts_at}|${row.ends_at}`;
    const mineSource = mineSourceByKey.get(key);
    const status: SlotStatus = row.kind === "blocked" ? "blocked" : mineSource ? "mine" : "taken";
    const list = byRoom.get(row.room_id) ?? [];
    list.push({
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      status,
      source: status === "mine" ? mineSource : undefined,
    });
    byRoom.set(row.room_id, list);
  }

  return byRoom;
}

/** סטטוס משבצת בודדת (חפיפה על [start,end), חסימה גוברת). */
export function slotStatus(
  slotStart: Date,
  slotEnd: Date,
  intervals: AvailabilityInterval[] | undefined,
): SlotStatus {
  if (!intervals) return "free";
  let result: SlotStatus = "free";
  for (const interval of intervals) {
    if (interval.startsAt < slotEnd && interval.endsAt > slotStart) {
      if (interval.status === "blocked") return "blocked";
      result = interval.status;
    }
  }
  return result;
}

/** מקור ההזמנה החופפת (ססיה/כרטיסייה) — רק להזמנות "mine", לצביעת התא. */
export function sourceAt(
  slotStart: Date,
  slotEnd: Date,
  intervals: AvailabilityInterval[] | undefined,
) {
  if (!intervals) return undefined;
  for (const interval of intervals) {
    if (interval.status === "mine" && interval.startsAt < slotEnd && interval.endsAt > slotStart) {
      return interval.source;
    }
  }
  return undefined;
}
