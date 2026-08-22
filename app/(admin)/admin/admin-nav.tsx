"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";

const LINKS = [
  { href: "/admin", label: "דשבורד" },
  { href: "/admin/board", label: "לוח מלא" },
  { href: "/admin/therapists", label: "מטפלים" },
  { href: "/admin/sessions", label: "בקשות ססיה" },
  { href: "/admin/payments", label: "תשלומים" },
  { href: "/admin/rooms", label: "סניפים וחדרים" },
  { href: "/admin/settings", label: "הגדרות" },
  { href: "/admin/reports", label: "דוחות" },
];

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-20 border-b bg-muted/30 backdrop-blur">
      <div className="flex items-center gap-1 p-2">
        <Link
          href="/admin"
          className="ml-2 shrink-0 px-2 py-1.5 text-lg font-bold text-primary"
          onClick={() => setOpen(false)}
        >
          Cleana
        </Link>

        {/* דסקטופ: תפריט מלא בשורה */}
        <div className="hidden flex-1 flex-wrap gap-1 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm hover:bg-muted",
                pathname === link.href && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <form action={signOut} className="hidden lg:block">
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            התנתקות
          </button>
        </form>

        {/* מובייל/טאבלט: כפתור המבורגר */}
        <button
          type="button"
          className="mr-auto flex size-10 items-center justify-center rounded-md hover:bg-muted lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 border-t p-2 lg:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-3 py-2.5 text-sm hover:bg-muted",
                pathname === link.href && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {link.label}
            </Link>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
              התנתקות
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}
