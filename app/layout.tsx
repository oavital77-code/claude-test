import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./service-worker-register";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
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
  themeColor: "#b5622f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <div className="bg-decor" aria-hidden="true">
          <span className="blob-1" />
          <span className="blob-2" />
          <span className="blob-3" />
        </div>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
