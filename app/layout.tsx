import type { Metadata, Viewport } from "next";
import { Heebo, Outfit } from "next/font/google";
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
    <html lang="he" dir="rtl" className={`${heebo.variable} ${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <div className="bg-decor" aria-hidden="true">
          <span className="blob-1" />
          <span className="blob-2" />
          <span className="blob-3" />
          <span className="line-1" />
          <span className="line-2" />
          <span className="ring-1" />
          <span className="ring-2" />
          <span className="mark-outline" />
        </div>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
