import { Home, CalendarDays, ClipboardList, ShoppingCart, Repeat, CreditCard, UserRound } from "lucide-react";
import type { NavItem } from "@/components/nav-types";

export const APP_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "בית", icon: Home },
  { href: "/schedule", label: "לוח זמנים", icon: CalendarDays },
  { href: "/bookings", label: "ההזמנות שלי", icon: ClipboardList },
  { href: "/purchase", label: "רכישת כרטיסייה", icon: ShoppingCart },
  { href: "/sessions", label: "הססיות שלי", icon: Repeat },
  { href: "/payments", label: "תשלומים", icon: CreditCard },
  { href: "/profile", label: "הכרטיס שלי", icon: UserRound },
];

// ניווט תחתון במובייל מוגבל ל-5 (ר' מסמך השפה העיצובית) — "רכישת כרטיסייה"
// ו"הססיות שלי" נגישות דרך "עוד" וגם דרך כפתורי CTA בדף הבית עצמו.
export const APP_MOBILE_HREFS = ["/", "/schedule", "/bookings", "/payments", "/profile"];
