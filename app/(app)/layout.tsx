import { getShellState } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";
import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { timeGridEnabled } from "@/lib/schedule/flag";
import { WHATS_NEW_KEY } from "@/lib/whats-new";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId, profile, mustChangePassword, whatsNewSeen } = await getShellState();

  // הודעת "מה חדש" — פעם אחת, רק למי שכבר בתוך המערכת בפועל (לא באמצע
  // הרשמה/תקנון/החלפת סיסמה/השעיה), ורק כשהלוח החדש שהיא מסבירה מופעל לו/ה.
  // מי שכבר ראה/תה לא משלם/ת קריאה נוספת ל-DB; לשאר — קריאה אחת של app_settings לבקשה (cache).
  const eligible =
    !!userId &&
    !!profile &&
    profile.status === "active" &&
    (!!profile.terms_accepted_at || profile.role === "admin") &&
    !mustChangePassword &&
    whatsNewSeen !== WHATS_NEW_KEY;
  const showWhatsNew = eligible && (await timeGridEnabled(userId));

  // גילוי וזקיפת רכישות מהחנות כבר לא כאן (after() אחרי הרינדור — המסך
  // הציג יתרה ישנה עד רענון): PurchaseSync ב-AppShell קורא ל-syncMyPurchases
  // מהדפדפן בפתיחה ובחזרה ללשונית, ומרענן את המסך כשנוספו שעות. ה-webhook
  // וה-cron היומי נשארים כמסלולים נוספים.
  return (
    <AppShell variant="app" adminEntryHref={profile?.role === "admin" ? "/admin" : undefined}>
      {children}
      {showWhatsNew && <WhatsNewDialog />}
    </AppShell>
  );
}
