import { requireAdmin } from "@/lib/auth/guards";

export default async function AdminDashboardPage() {
  const { profile } = await requireAdmin();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">פאנל ניהול — בקליניקה</h1>
      <p className="text-muted-foreground">שלום, {profile.full_name}. הדשבורד בבנייה — M6.</p>
    </div>
  );
}
