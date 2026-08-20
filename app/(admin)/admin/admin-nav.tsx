"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
    <nav className="flex flex-wrap gap-1 border-b bg-muted/30 p-2">
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
    </nav>
  );
}
