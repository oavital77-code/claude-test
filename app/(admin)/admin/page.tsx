import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";

export default async function AdminDashboardPage() {
  const { profile } = await requireAdmin();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">פאנל ניהול — בקליניקה</h1>
      <p className="text-muted-foreground">שלום, {profile.full_name}. שאר הדשבורד בבנייה — M6.</p>
      <Button asChild>
        <Link href="/admin/rooms">ניהול סניפים וחדרים</Link>
      </Button>
    </div>
  );
}
