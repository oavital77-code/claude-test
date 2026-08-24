"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function CalendarSyncLink({ icsToken }: { icsToken: string }) {
  const [copied, setCopied] = useState(false);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const feedUrl = `${baseUrl}/api/ics/${icsToken}`;
  // webcal:// גורם למערכת ההפעלה/לדפדפן לפתוח ישירות את אפליקציית היומן
  // המוגדרת כברירת מחדל (אפל קלנדר, אאוטלוק) במסך "הרשמה ליומן" — בלי
  // להעתיק כלום. גוגל קלנדר לא תומך ב-webcal בקישור ישיר, אבל תומך בפרמטר
  // cid שממלא מראש את כתובת ה-URL במסך "הוספת יומן מ-URL" שלו.
  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // דפדפן בלי clipboard API (נדיר) — הקישור עדיין מוצג לגלישה/העתקה ידנית
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 text-sm">
        <p className="font-medium">סנכרון יומן</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={webcalUrl}>הוספה ליומן (אפל / אאוטלוק)</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={googleUrl} target="_blank" rel="noopener noreferrer">
              הוספה ל-Google Calendar
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? "הועתק ✓" : "העתקת קישור"}
          </Button>
        </div>
        <p className="break-all text-xs text-muted-foreground" dir="ltr">
          {feedUrl}
        </p>
        <p className="text-xs text-muted-foreground">
          קישור אישי — אין לשתף. עדכון ביומן עשוי להתעכב בכמה שעות בהתאם ליישום היומן.
        </p>
      </CardContent>
    </Card>
  );
}
