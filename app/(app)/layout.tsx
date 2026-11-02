import { after } from "next/server";
import { getAuthState } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { pollWooOrders } from "@/lib/woo/poll";
import { AppShell } from "@/components/app-shell";

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
    // throttleSeconds: לכל היותר בדיקה אחת לדקה מול החנות, לכל המטפלים יחד —
    // ורכישה שהתגלתה נזקפת מיד (trigger auto_claim, 20261015000003).
    after(async () => {
      // כשל לא נבלע בשקט: בלי לוג, תקלה בשליפה (31/10–02/11) לא נראתה בשום
      // מקום ורכישות לא נזקפו. בלי PII — רק ההודעה.
      await pollWooOrders(90, { throttleSeconds: 60 }).catch((e: unknown) => {
        console.error("[woo] בדיקת הזמנות בטעינת עמוד נכשלה:", e instanceof Error ? e.message : e);
      });
      try {
        await supabase.rpc("claim_woo_pending_purchase");
      } catch {
        // best-effort — ה-cron היומי ינסה שוב
      }
      // יתרת שעות שהועברה מ-Skedda (טבלת skedda_migration). no-op עד ההשקה —
      // נשלט ע"י app_settings.skedda_balance_claim_enabled.
      try {
        await supabase.rpc("claim_skedda_balance");
      } catch {
        // best-effort — ינסה שוב בטעינה הבאה
      }
    });
  }

  return (
    <AppShell variant="app" adminEntryHref={profile?.role === "admin" ? "/admin" : undefined}>
      {children}
    </AppShell>
  );
}
