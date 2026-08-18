import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`חסר משתנה סביבה: ${name}`);
  return value;
}

export function getPayPlusConfig() {
  return {
    apiKey: requireEnv("PAYPLUS_API_KEY"),
    secretKey: requireEnv("PAYPLUS_SECRET_KEY"),
    paymentPageUid: requireEnv("PAYPLUS_PAYMENT_PAGE_UID"),
    baseUrl: requireEnv("PAYPLUS_BASE_URL"),
  };
}
