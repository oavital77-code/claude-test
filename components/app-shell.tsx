"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";
import { Logo } from "@/components/logo";
import type { NavItem } from "@/components/nav-types";
import { APP_NAV_ITEMS } from "@/app/(app)/nav";
import { ADMIN_NAV_ITEMS } from "@/app/(admin)/admin/admin-nav";

const HIDDEN_ON = ["/login", "/suspended", "/privacy", "/reset-password"];

// רשימות הפריטים (כולל רכיבי אייקון, שהם ערכי פונקציה) מיובאות כאן, בתוך
// קובץ "use client" — לא מועברות כ-prop מ-layout.tsx (Server Component),
// כי React לא יכול לסריאלז פונקציות דרך גבול server→client. ה-layout מעביר
// רק מחרוזת (variant) שבטוחה לגמרי לעבור.
const VARIANTS = {
  app: APP_NAV_ITEMS,
  admin: ADMIN_NAV_ITEMS,
} as const;

/**
 * שלד אפליקציה — סרגל צד קבוע מימין בדסקטופ (220px), משותף למטפלים
 * ולאדמין. במובייל אין סרגל צד: כותרת עליונה עם לוגו + המבורגר שפותח
 * פאנל נפתח מתחת לכותרת (בדיוק כמו הניווט הקודם) — בלי ניווט תחתון קבוע.
 */
export function AppShell({
  variant,
  adminEntryHref,
  homeHref = "/",
  children,
}: {
  variant: keyof typeof VARIANTS;
  adminEntryHref?: string;
  homeHref?: string;
  children: React.ReactNode;
}) {
  const items = VARIANTS[variant];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* סרגל צד — דסקטופ בלבד, קבוע מימין (dir=rtl הופך flex-row אוטומטית) */}
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col self-start border-e border-border bg-surface md:flex">
        <Link href={homeHref} className="flex items-center px-5 py-5">
          <Logo markClassName="size-9" wordmarkClassName="text-lg" />
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {items.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>
        <div className="flex flex-col gap-0.5 border-t border-border px-3 py-3">
          {adminEntryHref && (
            <Link
              href={adminEntryHref}
              className="flex items-center gap-2.5 rounded-button px-3 py-2.5 text-[14.5px] font-medium text-violet-600 transition-colors hover:bg-violet-50"
            >
              <Shield className="size-5" strokeWidth={1.5} />
              ניהול המערכת
            </Link>
          )}
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* ראש עמוד — מובייל בלבד: לוגו + המבורגר שפותח/סוגר פאנל תחתיו */}
        <header className="sticky top-0 z-20 flex flex-col border-b border-border bg-surface md:hidden">
          <div className="flex h-[68px] shrink-0 items-center gap-2 px-4">
            <Link href={homeHref} className="flex items-center">
              <Logo markClassName="size-8" wordmarkClassName="text-base" />
            </Link>
            <button
              type="button"
              className="ms-auto flex size-11 items-center justify-center rounded-button hover:bg-subtle"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
              aria-expanded={open}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>

          {open && (
            <nav className="flex flex-col gap-0.5 border-t border-border p-2">
              {items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  onClick={() => setOpen(false)}
                />
              ))}
              {adminEntryHref && (
                <Link
                  href={adminEntryHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-button px-3 py-2.5 text-[14.5px] font-medium text-violet-600 hover:bg-violet-50"
                >
                  <Shield className="size-5" strokeWidth={1.5} />
                  ניהול המערכת
                </Link>
              )}
              <SignOutButton />
            </nav>
          )}
        </header>

        <main className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-1 flex-col px-4 py-4 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-button px-3 py-2.5 text-[14.5px] font-medium text-text-secondary transition-colors hover:bg-subtle",
        active && "bg-violet-500 text-white hover:bg-violet-600",
      )}
    >
      <Icon className="size-5" strokeWidth={1.5} />
      {item.label}
    </Link>
  );
}

function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="flex w-full items-center gap-2.5 rounded-button px-3 py-2.5 text-[14.5px] font-medium text-text-muted transition-colors hover:bg-subtle hover:text-foreground"
      >
        <LogOut className="size-5" strokeWidth={1.5} />
        התנתקות
      </button>
    </form>
  );
}
