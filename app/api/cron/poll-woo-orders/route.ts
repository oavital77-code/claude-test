import { NextResponse } from "next/server";
import { withCronAlert } from "@/lib/cron/guard";
import { pollWooOrders } from "@/lib/woo/poll";

// רשת ביטחון יומית: אין webhook מוגדר בחנות כרגע, אז המסלול העיקרי לגילוי
// תשלומים הוא בדיקה יזומה בטעינת עמוד (ר' app/(app)/layout.tsx). ה-cron הזה
// תופס מי שלא פתח את האפליקציה אחרי ששילם — חלון של 26 שעות (מעט יותר
// מיממה) כדי לכסות בבטחון את הפער בין ריצה לריצה גם אם ריצה בודדת נכשלת.
export const GET = withCronAlert("poll-woo-orders", async () => {
  const result = await pollWooOrders(26 * 60);
  return NextResponse.json(result);
});
