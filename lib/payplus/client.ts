import "server-only";
import { getPayPlusConfig } from "./config";

// ⚠️ צורת הבקשה/תשובה כאן בנויה לפי baclinica-spec.md §7.3 (שמות שדות
// generateLink כפי שמופיעים במסמך האפיון). יש לאמת מול תיעוד ה-API הרשמי /
// Postman collection של PayPlus לפני עלייה לפרודקשן — יכולים להיות הבדלים
// בשמות שדות, במבנה התשובה, או במנגנון האימות (headers מול body).

export interface GeneratePaymentLinkInput {
  amountTotal: number;
  createToken?: boolean;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  itemName: string;
  moreInfo: string; // payment_id שלנו — קריטי לשיוך ה-callback (§7.3)
  successUrl: string;
  failureUrl: string;
  callbackUrl: string;
}

export interface GeneratePaymentLinkResult {
  paymentPageLink: string;
  pageRequestUid: string;
}

export async function generatePaymentLink(
  input: GeneratePaymentLinkInput,
): Promise<GeneratePaymentLinkResult> {
  const config = getPayPlusConfig();

  const res = await fetch(`${config.baseUrl}/PaymentPages/generateLink`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: config.secretKey,
    },
    body: JSON.stringify({
      payment_page_uid: config.paymentPageUid,
      api_key: config.apiKey,
      secret_key: config.secretKey,
      amount: input.amountTotal,
      currency_code: "ILS",
      charge_method: 1,
      create_token: input.createToken ?? false,
      customer: {
        customer_name: input.customerName,
        email: input.customerEmail,
        phone: input.customerPhone,
      },
      items: [{ name: input.itemName, quantity: 1, price: input.amountTotal }],
      refURL_success: input.successUrl,
      refURL_failure: input.failureUrl,
      refURL_callback: input.callbackUrl,
      more_info: input.moreInfo,
    }),
  });

  if (!res.ok) {
    throw new Error(`PayPlus generateLink נכשל: ${res.status}`);
  }

  const json = (await res.json()) as {
    results?: { status?: string; code?: number; message?: string };
    data?: { payment_page_link?: string; page_request_uid?: string };
  };

  if (json.results?.status !== "success" || !json.data?.payment_page_link) {
    throw new Error(json.results?.message ?? "PayPlus generateLink החזיר תשובה לא צפויה");
  }

  return {
    paymentPageLink: json.data.payment_page_link,
    pageRequestUid: json.data.page_request_uid ?? "",
  };
}

export type PayPlusReconciledStatus = "paid" | "failed" | "pending" | "unknown";

/**
 * ⚠️ שחזור לתשלומים "תקועים" ב-pending מעל 15 דק' (callback שאבד — spec §13).
 * מסמך האפיון שסופק לא כולל את ה-endpoint המדויק לבדיקת סטטוס עסקה מול
 * PayPlus. הפונקציה הזו היא **stub מפורש** ולא ניחוש שמוצג כמוגמר — היא
 * זורקת שגיאה בכוונה כדי שהקורא (ה-cron) יתפוס אותה, ירשום כישלון-בדיקה
 * לתשלום הספציפי, וימשיך הלאה בלי לקרוס. יש להחליף במימוש אמיתי מול
 * תיעוד PayPlus (כנראה /PaymentPages/GetTransactionStatus או דומה) לפני
 * שסומכים על ה-cron הזה בפרודקשן.
 */
export async function queryPaymentStatus(
  pageRequestUid: string,
): Promise<PayPlusReconciledStatus> {
  throw new Error(
    `queryPaymentStatus אינו ממומש עבור page_request_uid=${pageRequestUid} — יש לאמת את ה-endpoint הנכון מול תיעוד PayPlus (ר' הערה בקוד)`,
  );
}

export interface ChargeByTokenResult {
  success: boolean;
  transactionUid: string;
  invoiceUrl?: string;
  failureReason?: string;
}

/**
 * ⚠️ חיוב חוזר (חידוש ססיה, §6.7) באמצעות טוקן שנשמר בעסקה הראשונית
 * (create_token=true, §7.2). מסמך האפיון אינו כולל את ה-endpoint המדויק
 * לחיוב טוקן ב-PayPlus. **stub מפורש** — לא ניחוש שמוצג כמוגמר. זורקת
 * שגיאה בכוונה כדי שהקורא (app/api/cron/charge-renewals) יתפוס אותה
 * ויתעד אותה כחיוב שנכשל (מה שמפעיל נכון את לוגיקת ה-3 ניסיונות/השעיה,
 * כי חיוב אמיתי שנדחה גם הוא צריך לעבור באותו נתיב) במקום לקרוס על כל
 * הבאטש. יש להחליף במימוש אמיתי מול תיעוד PayPlus (חיוב לפי טוקן, לא
 * generateLink) לפני שסומכים על החיוב האוטומטי הזה בפרודקשן — חיוב כרטיס
 * אשראי בלי אישור משתמש מחייב וודאות מלאה לגבי הפורמט, לא ניחוש.
 */
export async function chargeByToken(
  tokenUid: string,
  amountTotal: number,
  moreInfo: string,
): Promise<ChargeByTokenResult> {
  throw new Error(
    `chargeByToken אינו ממומש (more_info=${moreInfo}, amount=${amountTotal}, token=${tokenUid.slice(0, 4)}...) — יש לאמת את ה-endpoint הנכון לחיוב טוקן מול תיעוד PayPlus לפני שימוש בפרודקשן (ר' הערה בקוד)`,
  );
}
