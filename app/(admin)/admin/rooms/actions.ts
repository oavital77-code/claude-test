"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const branchSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "יש להזין שם סניף"),
  address: z.string().trim().min(1, "יש להזין כתובת"),
  waze_url: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  active: z.boolean(),
});

export async function saveBranch(formValues: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = branchSchema.safeParse(formValues);
  if (!parsed.success) return { ok: false, error: "פרטי הסניף לא תקינים" };
  const { id, name, address, waze_url, phone, active } = parsed.data;

  const supabase = await createClient();
  const payload = {
    name,
    address,
    waze_url: waze_url || null,
    phone: phone || null,
    active,
  };

  const { error } = id
    ? await supabase.from("branches").update(payload).eq("id", id)
    : await supabase.from("branches").insert(payload);

  if (error) return { ok: false, error: "שמירת הסניף נכשלה" };
  return { ok: true };
}

const roomSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid(),
  name: z.string().trim().min(1, "יש להזין שם חדר"),
  room_type: z.enum(["talk", "touch", "podcast", "group"]),
  capacity: z.coerce.number().int().min(1).max(20),
  description: z.string().trim().optional().or(z.literal("")),
  equipment: z.string().trim().optional().or(z.literal("")), // מופרד בפסיקים
  active: z.boolean(),
});

export async function saveRoom(formValues: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = roomSchema.safeParse(formValues);
  if (!parsed.success) return { ok: false, error: "פרטי החדר לא תקינים" };
  const { id, branch_id, name, room_type, capacity, description, equipment, active } =
    parsed.data;

  const supabase = await createClient();
  const payload = {
    branch_id,
    name,
    room_type,
    capacity,
    description: description || null,
    equipment: (equipment || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    active,
  };

  const { error } = id
    ? await supabase.from("rooms").update(payload).eq("id", id)
    : await supabase.from("rooms").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "כבר קיים חדר בשם הזה בסניף זה" };
    }
    return { ok: false, error: "שמירת החדר נכשלה" };
  }
  return { ok: true };
}
