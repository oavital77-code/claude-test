import { after } from "next/server";
import { getAuthState } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { pollWooOrders } from "@/lib/woo/poll";
import { AppNav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getAuthState();

  if (profile) {
    // הלקוח נוצר בתוך scope הבקשה (cookies), ומשמש בתוך after().
    const supabase = await createClient();

    // גילוי + זקיפה של רכישה מ-Woo. רץ *אחרי* שהתגובה נשלחת, כדי שלא
    // יוסיף זמן טעינה לכל כניסה למערכת: pollWooOrders מבצע קריאת HTTP
    // חיצונית לחנות, ו-claim_woo_pending_purchase הוא עוד round-trip ל-DB.
    //
    // הסדר חשוב: קודם poll (כותב ל-woo_pending_purchases), אחר כך claim
    // (צורך משם) — כך שתשלום שהתגלה עכשיו נזקף באותה טעינה ולא בטעינה הבאה.
    //
    // רכישת כרטיסייה נוספת/חידוש דרך אתר בקליניקה: מי שכבר רשום/ה ל-Cleana
    // לא עובר/ת דרך completeRegistration שוב, ולכן הבדיקה חוזרת בכל כניסה.
    // חלון קצר (90 דק') כי היא רצה כמעט בכל טעינת עמוד; ה-cron היומי
    // (poll-woo-orders) הוא רשת הביטחון למי שלא פותח את האפליקציה בכלל.
    after(async () => {
      await pollWooOrders(90).catch(() => {});
      try {
        await supabase.rpc("claim_woo_pending_purchase");
      } catch {
        // best-effort — ה-cron היומי ינסה שוב
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppNav isAdmin={profile?.role === "admin"} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
