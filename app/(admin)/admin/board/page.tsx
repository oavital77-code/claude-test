import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { BoardClient } from "./board-client";

export default async function AdminBoardPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: branches }, { data: therapists }] = await Promise.all([
    supabase.from("branches").select("*").eq("active", true).order("sort_order"),
    // בלי סינון role: הזמנה יכולה להיות משוייכת גם למשתמש עם role='admin'
    // (למשל שיבוץ ידני לבדיקה) — ורוצים תמיד להציג שם אמיתי, לא "מטפל/ת".
    supabase.from("profiles").select("id, full_name, phone").order("full_name"),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">לוח מלא</h1>
      <BoardClient branches={branches ?? []} therapists={therapists ?? []} />
    </div>
  );
}
