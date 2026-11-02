import { getAuthState } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getAuthState();

  // גילוי וזקיפת רכישות מהחנות כבר לא כאן (after() אחרי הרינדור — המסך
  // הציג יתרה ישנה עד רענון): PurchaseSync ב-AppShell קורא ל-syncMyPurchases
  // מהדפדפן בפתיחה ובחזרה ללשונית, ומרענן את המסך כשנוספו שעות. ה-webhook
  // וה-cron היומי נשארים כמסלולים נוספים.
  return (
    <AppShell variant="app" adminEntryHref={profile?.role === "admin" ? "/admin" : undefined}>
      {children}
    </AppShell>
  );
}
