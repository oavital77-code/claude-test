import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Voltsafe | תיק חסין אש לסוללות ליתיום",
  description:
    "Voltsafe – תיק הגנה חכם לטעינה ואחסון בטוחים של סוללות ליתיום-יון לאופניים חשמליים, קורקינטים וכלי עבודה. הצטרפו לרשימת ההמתנה.",
  metadataBase: new URL("https://voltsafe.example"),
  openGraph: {
    title: "Voltsafe | הגנה אמיתית. פשוטה באמת.",
    description:
      "תיק חסין אש עם ניטור חכם לסוללות ליתיום-יון. הצטרפו לרשימת ההמתנה להשקה.",
    locale: "he_IL",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-ink">{children}</body>
    </html>
  );
}
