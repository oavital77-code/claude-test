// Service worker — בקליניקה
// תפקיד מכוון וצנוע: מספק את קריטריוני ה-installability של PWA (מניפסט +
// service worker עם fetch handler), ומטמין נכסים סטטיים בלבד.
//
// 🔴 שום דבר דינמי לא נשמר במטמון — לא עמודי הזמנות, לא API, לא לוח הזמנים.
// הצגת זמינות/יתרה שגויה כי היא הגיעה ממטמון ישן חמורה בהרבה מאשר "אין
// אינטרנט זמנית" (CLAUDE.md: אין localStorage לנתוני אמת — אותו עיקרון).

const CACHE_NAME = "baclinica-shell-v1";
const SHELL_ASSETS = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") || url.pathname === "/icon" || url.pathname === "/apple-icon";

  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
  }
  // כל שאר הבקשות (API, נתונים) — עוברות ישירות לרשת, בלי יירוט.
});
