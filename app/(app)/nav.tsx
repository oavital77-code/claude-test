"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  ClipboardList,
  ShoppingCart,
  Repeat,
  CreditCard,
  Shield,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";
import { Logo } from "@/components/logo";

const LINKS = [
  { href: "/", label: "בית", icon: Home },
  { href: "/schedule", label: "לוח זמנים", icon: CalendarDays },
  { href: "/bookings", label: "ההזמנות שלי", icon: ClipboardList },
  { href: "/purchase", label: "רכישת כרטיסייה", icon: ShoppingCart },
  { href: "/sessions", label: "הססיות שלי", icon: Repeat },
  { href: "/payments", label: "תשלומים", icon: CreditCard },
];

const HIDDEN_ON = ["/login", "/suspended", "/privacy"];

export function AppNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 p-2">
        <Link href="/" className="ml-2 shrink-0 px-2 py-1.5" onClick={() => setOpen(false)}>
          <Logo markClassName="size-10" wordmarkClassName="text-xl" />
        </Link>

        {/* דסקטופ: תפריט מלא בשורה */}
        <nav className="hidden flex-1 flex-wrap gap-1 md:flex">
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

        {isAdmin && (
          <Link
            href="/admin"
            className="hidden items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary/10 md:flex"
          >
            <Shield className="size-4" />
            כניסה לניהול המערכת
          </Link>
        )}

        <form action={signOut} className="hidden md:block">
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            התנתקות
          </button>
        </form>

        {/* מובייל: כפתור המבורגר שפותח/סוגר את התפריט */}
        <button
          type="button"
          className="mr-auto flex size-10 items-center justify-center rounded-md hover:bg-muted md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* מובייל: פאנל תפריט נפתח */}
      {open && (
        <nav className="flex flex-col gap-1 border-t border-border/70 p-2 md:hidden">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted",
                  active && "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                <Icon className="size-4" />
                {link.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md border border-primary px-3 py-2.5 text-sm text-primary hover:bg-primary/10"
            >
              <Shield className="size-4" />
              כניסה לניהול המערכת
            </Link>
          )}

          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
              התנתקות
            </button>
          </form>
        </nav>
      )}
    </header>
  );
}
