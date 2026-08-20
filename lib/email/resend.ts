import "server-only";

const RESEND_API_URL = "https://api.resend.com/emails";

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
    console.warn(`[email] RESEND לא מוגדר — לא נשלח: "${input.subject}"`);
    return { ok: false, error: "RESEND_NOT_CONFIGURED" };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments,
      }),
    });

    if (!res.ok) {
      console.error(`[email] Resend החזיר ${res.status} עבור "${input.subject}"`);
      return { ok: false, error: `RESEND_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] שליחה נכשלה", err);
    return { ok: false, error: err instanceof Error ? err.message : "UNKNOWN" };
  }
}
