"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  room_type: z.array(z.enum(["talk", "touch", "podcast", "group"])).min(1, "יש לבחור לפחות סוג חדר אחד"),
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

export type UploadRoomImageResult = { ok: true; url: string } | { ok: false; error: string };

export async function uploadRoomImage(roomId: string, formData: FormData): Promise<UploadRoomImageResult> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "לא נבחר קובץ" };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "מותר רק קבצי JPG, PNG או WEBP" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "הקובץ גדול מדי (מקסימום 5MB)" };
  }

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${roomId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("room-images")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    return { ok: false, error: "העלאת התמונה נכשלה" };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("room-images").getPublicUrl(path);

  const { data: room } = await admin.from("rooms").select("images").eq("id", roomId).maybeSingle();
  const nextImages = [...((room?.images as string[] | null) ?? []), publicUrl];

  const { error: updateError } = await admin.from("rooms").update({ images: nextImages }).eq("id", roomId);
  if (updateError) {
    return { ok: false, error: "התמונה הועלתה אך שמירתה בחדר נכשלה" };
  }

  return { ok: true, url: publicUrl };
}

export async function removeRoomImage(roomId: string, url: string): Promise<ActionResult> {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: room } = await admin.from("rooms").select("images").eq("id", roomId).maybeSingle();
  const nextImages = ((room?.images as string[] | null) ?? []).filter((u) => u !== url);

  const { error: updateError } = await admin.from("rooms").update({ images: nextImages }).eq("id", roomId);
  if (updateError) return { ok: false, error: "עדכון החדר נכשל" };

  const path = url.split("/room-images/")[1];
  if (path) {
    await admin.storage.from("room-images").remove([path]);
  }

  return { ok: true };
}
