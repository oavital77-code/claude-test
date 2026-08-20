import { Card, CardContent } from "@/components/ui/card";

export function CalendarSyncLink({ icsToken }: { icsToken: string }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const feedUrl = `${baseUrl}/api/ics/${icsToken}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4 text-sm">
        <p className="font-medium">סנכרון יומן</p>
        <p className="break-all text-muted-foreground" dir="ltr">
          {feedUrl}
        </p>
        <p className="text-xs text-muted-foreground">
          קישור אישי — אין לשתף. בגוגל קלנדר: הוספת יומן → מ-URL. באפל קלנדר: קובץ → יומן חדש מנוי → הדבקת הקישור.
        </p>
      </CardContent>
    </Card>
  );
}
