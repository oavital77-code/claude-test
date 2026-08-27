import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Repeat,
  CreditCard,
  Building2,
  Settings,
  BarChart3,
  ScrollText,
} from "lucide-react";
import type { NavItem } from "@/components/nav-types";

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "מסך הבית", icon: LayoutDashboard },
  { href: "/admin/board", label: "לוח מלא", icon: CalendarDays },
  { href: "/admin/therapists", label: "מטפלים", icon: Users },
  { href: "/admin/sessions", label: "בקשות ססיה", icon: Repeat },
  { href: "/admin/payments", label: "תשלומים", icon: CreditCard },
  { href: "/admin/rooms", label: "סניפים וחדרים", icon: Building2 },
  { href: "/admin/settings", label: "הגדרות", icon: Settings },
  { href: "/admin/reports", label: "דוחות", icon: BarChart3 },
  { href: "/admin/audit", label: "יומן פעולות", icon: ScrollText },
];

// לוח האדמין הוא desktop-first (ר' CLAUDE.md) — ניווט תחתון במובייל נשאר
// מוגבל ל-5 הכי נחוצים; שאר המסכים נגישים דרך "עוד".
export const ADMIN_MOBILE_HREFS = ["/admin", "/admin/board", "/admin/therapists", "/admin/payments", "/admin/settings"];
