import "server-only";

const RESEND_API_URL = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;

export interface EmailAttachment {
  filename: string;
  /** base64-encoded content, כפי ש-Resend מצפה. */
  content: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * שולח מייל דרך Resend. לעולם לא זורק — כישלון שליחה לא אמור להפיל זרימה
 * עסקית (הזמנה/תשלום/ביטול) שכבר הצליחה. אם RESEND_API_KEY / RESEND_FROM_EMAIL
 * לא מוגדרים (עדיין אין חשבון Resend מאומת — ר' baclinica-spec.md §12), הפונקציה
 * מתעדת זאת ומחזירה כישלון "רך" במקום לזרוק.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn("[email] RESEND לא מוגדר — המייל לא נשלח");
    return { ok: false, error: "RESEND_NOT_CONFIGURED" };
  }

  // ניסיון חוזר אחד על ניתוק רשת / 5xx / 429 (בפרודקשן: "fetch failed — other
  // side closed" ×3 בשבוע, ומטפלות לא קיבלו אישור הזמנה). אותו Idempotency-Key
  // בשני הניסיונות — אם הראשון בכל זאת הגיע ל-Resend, השני לא ישלח כפול.
  const idempotencyKey = crypto.randomUUID();
  let lastError = "UNKNOWN";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          attachments: input.attachments,
        }),
      });
      if (res.ok) return { ok: true };
      lastError = `RESEND_${res.status}`;
      // בלי נושא המייל בלוג — הוא כולל שם מטפל/ת או מייל (PII).
      console.error(`[email] Resend החזיר ${res.status} (ניסיון ${attempt})`);
      if (res.status < 500 && res.status !== 429) break; // שגיאת תוכן — ניסיון נוסף לא יעזור
    } catch (err) {
      lastError = err instanceof Error ? err.message : "UNKNOWN";
      console.error(`[email] שליחה נכשלה (ניסיון ${attempt})`, err);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  return { ok: false, error: lastError };
}
