import { NextResponse } from "next/server";
import { withCronAlert } from "@/lib/cron/guard";
import { pollWooOrders } from "@/lib/woo/poll";

// רשת ביטחון יומית: אין webhook מוגדר בחנות כרגע, אז המסלול העיקרי לגילוי
// תשלומים הוא בדיקה יזומה בטעינת עמוד (ר' app/(app)/layout.tsx). ה-cron הזה
// תופס מי שלא פתח את האפליקציה אחרי ששילם — חלון של 50 שעות: ה-cron יומי,
// אז 26 שעות כיסו רק את הפער בין שתי ריצות *מוצלחות*; ריצה אחת שנכשלת השאירה
// כ-22 שעות בלי כיסוי. 50 שעות = יממתיים + מרווח. העיבוד אידמפוטנטי.
export const GET = withCronAlert("poll-woo-orders", async () => {
  const result = await pollWooOrders(50 * 60);
  return NextResponse.json(result);
});
