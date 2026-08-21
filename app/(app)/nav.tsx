"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  ClipboardList,
  ShoppingCart,
  Repeat,
  CreditCard,
  Clock,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";

const LINKS = [
  { href: "/", label: "בית", icon: Home },
  { href: "/schedule", label: "לוח זמנים", icon: CalendarDays },
  { href: "/bookings", label: "ההזמנות שלי", icon: ClipboardList },
  { href: "/purchase", label: "רכישת כרטיסייה", icon: ShoppingCart },
  { href: "/sessions", label: "הססיות שלי", icon: Repeat },
  { href: "/payments", label: "תשלומים", icon: CreditCard },
  { href: "/waitlist", label: "רשימת המתנה", icon: Clock },
];

const HIDDEN_ON = ["/login", "/suspended"];

export function AppNav() {
  const pathname = usePathname();

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border/70 bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 p-2">
        <Link href="/" className="ml-2 shrink-0 px-2 py-1.5 text-lg font-bold text-primary">
          Cleana
        </Link>

        <nav className="flex flex-1 flex-wrap gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-muted",
                  active && "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                <Icon className="size-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            התנתקות
          </button>
        </form>
      </div>
    </header>
  );
}
