import type { Metadata, Viewport } from "next";
import { Heebo, IBM_Plex_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./service-worker-register";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

// לוורדמארק "Cleana" בלבד (ר' brand kit) — לא פונט הגוף הכללי, שנשאר Heebo.
const outfit = Outfit({
  variable: "--font-outfit-logo",
  subsets: ["latin"],
  weight: ["500", "600"],
});

// למזהים/קודים טכניים בלבד (מספרי הזמנה, קוד דלת) — לא לטקסט רגיל.
// שם המשתנה שונה מ---font-mono בכוונה: זה השם שמשמש כמפתח ה-theme של
// Tailwind (font-mono utility) ב-globals.css — אילו שני השמות היו זהים,
// ה-var() שם היה מפנה לעצמו (circular reference) ונופל.
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Cleana",
  description: "מערכת ניהול השכרת קליניקות",
  appleWebApp: {
    capable: true,
    title: "Cleana",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7A5AF8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${outfit.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
