// זמני — בדיקת חיווט Sentry בפרודקשן. למחוק אחרי שווידאנו שהשגיאה מגיעה ל-Issues.
export async function GET() {
  throw new Error("בדיקת Sentry — אפשר למחוק את ה-route הזה");
}
