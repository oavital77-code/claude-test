"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";

const LINKS = [
  { href: "/admin", label: "דשבורד" },
  { href: "/admin/board", label: "לוח מלא" },
  { href: "/admin/therapists", label: "מטפלים" },
  { href: "/admin/sessions", label: "בקשות ססיה" },
  { href: "/admin/overruns", label: "רישום חריגה" },
  { href: "/admin/payments", label: "תשלומים" },
  { href: "/admin/rooms", label: "סניפים וחדרים" },
  { href: "/admin/settings", label: "הגדרות" },
  { href: "/admin/reports", label: "דוחות" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2">
      <Link href="/admin" className="ml-2 shrink-0 px-2 py-1.5 text-lg font-bold text-primary">
        Cleana
      </Link>
      <div className="flex flex-1 flex-wrap gap-1">
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
      <form action={signOut}>
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
          התנתקות
        </button>
      </form>
    </nav>
  );
}
