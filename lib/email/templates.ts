import "server-only";
import { emailLayout, emailButton } from "./layout";
import { formatDateHe, formatDateTimeHe, formatTimeHe } from "@/lib/time";
import { formatCurrency } from "@/lib/format";

export interface EmailContent {
  subject: string;
  html: string;
}

export function bookingConfirmedEmail(params: {
  roomName: string;
  branchName: string;
  startsAt: Date;
  endsAt: Date;
  accessStart: Date;
  accessEnd: Date;
}): EmailContent {
  return {
    subject: `אישור הזמנה — ${params.roomName}, ${formatDateHe(params.startsAt)}`,
    html: emailLayout(`
      <p>ההזמנה שלך אושרה:</p>
      <p style="font-weight:700;font-size:17px;">${params.roomName} · ${params.branchName}</p>
      <p>${formatDateHe(params.startsAt)}, ${formatTimeHe(params.startsAt)}–${formatTimeHe(params.endsAt)}</p>
      <p style="color:#6b7570;">🔑 כניסה בפועל: ${formatTimeHe(params.accessStart)} · פינוי: ${formatTimeHe(params.accessEnd)}</p>
      <p style="color:#6b7570;font-size:13px;">קובץ ICS מצורף — ניתן להוסיף ליומן.</p>
    `),
  };
}

export function bookingCancelledEmail(params: {
  roomName: string;
  startsAt: Date;
  hoursRefunded: boolean;
}): EmailContent {
  return {
    subject: `ההזמנה בוטלה — ${params.roomName}, ${formatDateHe(params.startsAt)}`,
    html: emailLayout(`
      <p>ההזמנה הבאה בוטלה:</p>
      <p style="font-weight:700;">${params.roomName} · ${formatDateHe(params.startsAt)}, ${formatTimeHe(params.startsAt)}</p>
      <p>${params.hoursRefunded ? "השעות הוחזרו ליתרה שלך." : "הביטול בוצע בתוך 24 שעות מהמועד — השעות לא הוחזרו."}</p>
    `),
  };
}

export function punchCardPurchasedEmail(params: {
  hours: number;
  amountTotal: number;
  expiresAt: Date;
  invoiceUrl?: string | null;
}): EmailContent {
  return {
    subject: `כרטיסייה נרכשה — ${params.hours} שעות`,
    html: emailLayout(`
      <p>הכרטיסייה שלך פעילה:</p>
      <p style="font-weight:700;">${params.hours} שעות · תוקף עד ${formatDateHe(params.expiresAt)}</p>
      <p>סה״כ שולם: ${formatCurrency(params.amountTotal)}</p>
      ${params.invoiceUrl ? emailButton(params.invoiceUrl, "לחשבונית") : ""}
    `),
  };
}

export function lowBalanceEmail(hoursRemaining: number): EmailContent {
  return {
    subject: "היתרה שלך עומדת להיגמר",
    html: emailLayout(`
      <p>נותרו לך <strong>${hoursRemaining} שעות</strong> בלבד ביתרה.</p>
      <p>מומלץ לרכוש כרטיסייה נוספת כדי לא להישאר בלי אפשרות להזמין.</p>
    `),
  };
}

export function cardExpiringEmail(expiresAt: Date, hoursRemaining: number): EmailContent {
  return {
    subject: "כרטיסייה עומדת לפוג בקרוב",
    html: emailLayout(`
      <p>הכרטיסייה שלך (${hoursRemaining} שעות נותרות) פגה בתאריך <strong>${formatDateHe(expiresAt)}</strong>.</p>
      <p>שעות שלא ינוצלו עד אז יאבדו.</p>
    `),
  };
}

export function sessionRequestedAdminEmail(params: {
  therapistName: string;
  weeklyHours: number;
  monthlyPrice: number;
}): EmailContent {
  return {
    subject: `בקשת ססיה חדשה — ${params.therapistName}`,
    html: emailLayout(`
      <p>התקבלה בקשת ססיה חדשה:</p>
      <p style="font-weight:700;">${params.therapistName} · ${params.weeklyHours} שעות שבועיות · ${formatCurrency(params.monthlyPrice)}/חודש</p>
      <p>יש לבדוק זמינות ולאשר/לדחות בפאנל הניהול.</p>
    `),
  };
}

export function sessionApprovedEmail(paymentUrl: string): EmailContent {
  return {
    subject: "בקשת הססיה שלך אושרה",
    html: emailLayout(`
      <p>בקשת הססיה שלך אושרה. יש להשלים תשלום תוך 72 שעות כדי לנעול את המשבצות.</p>
      ${emailButton(paymentUrl, "מעבר לתשלום")}
    `),
  };
}

export function sessionRejectedEmail(reason: string): EmailContent {
  return {
    subject: "בקשת הססיה שלך נדחתה",
    html: emailLayout(`
      <p>לצערנו בקשת הססיה שלך לא אושרה.</p>
      <p style="font-weight:700;">סיבה: ${reason}</p>
      <p>ניתן לפנות להנהלה לבירור או להגיש בקשה חדשה.</p>
    `),
  };
}

export function sessionRenewedEmail(amountTotal: number, invoiceUrl?: string | null): EmailContent {
  return {
    subject: "חידוש מנוי ססיה",
    html: emailLayout(`
      <p>מנוי הססיה שלך חודש בהצלחה.</p>
      <p>סכום החיוב: ${formatCurrency(amountTotal)}</p>
      ${invoiceUrl ? emailButton(invoiceUrl, "לחשבונית") : ""}
    `),
  };
}

export function paymentFailedEmail(params: { amountTotal: number; context: string }): EmailContent {
  return {
    subject: "חיוב נכשל",
    html: emailLayout(`
      <p>חיוב בסך ${formatCurrency(params.amountTotal)} עבור ${params.context} נכשל.</p>
      <p>ייתכן שהחשבון יושעה עד להסדרת אמצעי התשלום. יש לפנות להנהלה במידת הצורך.</p>
    `),
  };
}

export function overrunRecordedEmail(params: {
  minutes: number;
  amount: number;
  source: "deposit" | "charge";
}): EmailContent {
  return {
    subject: "נרשמה חריגת זמן",
    html: emailLayout(`
      <p>נרשמה חריגה של ${params.minutes} דקות, בסך ${formatCurrency(params.amount)}.</p>
      <p>${params.source === "deposit" ? "הסכום נוכה מהפיקדון." : "הסכום חויב באמצעי התשלום השמור."}</p>
    `),
  };
}

export function materializationConflictAdminEmail(params: {
  roomName: string;
  startsAt: Date;
}): EmailContent {
  return {
    subject: `🚨 התנגשות בשיבוץ ססיה — ${params.roomName}`,
    html: emailLayout(`
      <p>ניסיון שיבוץ אוטומטי של ססיה נכשל עקב חפיפה קיימת:</p>
      <p style="font-weight:700;">${params.roomName} · ${formatDateTimeHe(params.startsAt)}</p>
      <p>נדרשת בדיקה ידנית בפאנל הניהול.</p>
    `),
  };
}

export function bookingReminderEmail(params: {
  roomName: string;
  branchName: string;
  startsAt: Date;
  accessStart: Date;
}): EmailContent {
  return {
    subject: `תזכורת — הזמנה מחר ב-${params.roomName}`,
    html: emailLayout(`
      <p>תזכורת להזמנה שלך מחר:</p>
      <p style="font-weight:700;">${params.roomName} · ${params.branchName}</p>
      <p>${formatDateHe(params.startsAt)}, ${formatTimeHe(params.startsAt)}</p>
      <p style="color:#6b7570;">🔑 כניסה בפועל: ${formatTimeHe(params.accessStart)}</p>
    `),
  };
}

export function waitlistSlotAvailableEmail(params: {
  roomName: string;
  date: string;
}): EmailContent {
  return {
    subject: "התפנה חלון שביקשת",
    html: emailLayout(`
      <p>התפנתה משבצת בחדר <strong>${params.roomName}</strong> בתאריך ${params.date}.</p>
      <p>ההזמנה בלוח הזמנים היא לפי כל הקודם זוכה — מומלץ להזדרז.</p>
    `),
  };
}
