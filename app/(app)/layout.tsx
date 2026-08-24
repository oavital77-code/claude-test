import { getAuthState } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getAuthState();

  // רכישת כרטיסייה נוספת/חידוש דרך אתר בקליניקה: מי שכבר רשום/ה ל-Cleana
  // לא עובר/ת דרך completeRegistration שוב, אז בודקים "רכישה ממתינה" בכל
  // כניסה למערכת (best-effort, לא חוסם רינדור אם נכשל).
  if (profile) {
    const supabase = await createClient();
    try {
      await supabase.rpc("claim_woo_pending_purchase");
    } catch {
      // best-effort — לא חוסם רינדור של העמוד
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppNav isAdmin={profile?.role === "admin"} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
