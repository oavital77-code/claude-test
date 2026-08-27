"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, MoreHorizontal, Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";
import { Logo } from "@/components/logo";
import type { NavItem } from "@/components/nav-types";
import { APP_NAV_ITEMS, APP_MOBILE_HREFS } from "@/app/(app)/nav";
import { ADMIN_NAV_ITEMS, ADMIN_MOBILE_HREFS } from "@/app/(admin)/admin/admin-nav";

const HIDDEN_ON = ["/login", "/suspended", "/privacy", "/reset-password"];

// רשימות הפריטים (כולל רכיבי אייקון, שהם ערכי פונקציה) מיובאות כאן, בתוך
// קובץ "use client" — לא מועברות כ-prop מ-layout.tsx (Server Component),
// כי React לא יכול לסריאלז פונקציות דרך גבול server→client. ה-layout מעביר
// רק מחרוזת (variant) שבטוחה לגמרי לעבור.
const VARIANTS = {
  app: { items: APP_NAV_ITEMS, mobileHrefs: APP_MOBILE_HREFS },
  admin: { items: ADMIN_NAV_ITEMS, mobileHrefs: ADMIN_MOBILE_HREFS },
} as const;

/**
 * שלד אפליקציה משותף למטפלים ולאדמין — לפי מסמך השפה העיצובית: "שני סוגי
 * משתמשים... באותה מערכת עם אותם רכיבים, רק ההרשאות והנתונים משתנים".
 * סרגל צד קבוע מימין בדסקטופ (220px); במובייל הופך לניווט תחתון עד 5
 * פריטים + "עוד" למגירה עם השאר, כדי שלא יאבד גישה לאף מסך.
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
  const { items, mobileHrefs } = VARIANTS[variant];
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }

  const bottomHrefs = mobileHrefs.slice(0, 5);
  const bottomItems = bottomHrefs
    .map((href) => items.find((i) => i.href === href))
    .filter((i): i is NavItem => Boolean(i));
  const overflowItems = items.filter((i) => !bottomHrefs.includes(i.href));

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

      <div className="flex min-h-screen flex-1 flex-col">
        {/* ראש עמוד — מובייל בלבד: לוגו + המבורגר לתפריט המלא */}
        <header className="sticky top-0 z-20 flex h-[68px] shrink-0 items-center gap-2 border-b border-border bg-surface px-4 md:hidden">
          <Link href={homeHref} className="flex items-center">
            <Logo markClassName="size-8" wordmarkClassName="text-base" />
          </Link>
          <button
            type="button"
            className="ms-auto flex size-11 items-center justify-center rounded-button hover:bg-subtle"
            onClick={() => setDrawerOpen(true)}
            aria-label="פתיחת תפריט"
          >
            <Menu className="size-5" />
          </button>
        </header>

        <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-4 pb-24 pt-4 md:px-8 md:py-8 md:pb-8">
          {children}
        </main>

        {/* ניווט תחתון — מובייל בלבד, עד 5 פריטים + "עוד" */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-stretch border-t border-border bg-surface md:hidden">
          {bottomItems.map((item) => (
            <BottomNavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
          {overflowItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text-muted"
            >
              <MoreHorizontal className="size-5" strokeWidth={1.5} />
              עוד
            </button>
          )}
        </nav>
      </div>

      {drawerOpen && (
        <MobileSheet title="תפריט" onClose={() => setDrawerOpen(false)}>
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href}
              onClick={() => setDrawerOpen(false)}
            />
          ))}
          {adminEntryHref && (
            <Link
              href={adminEntryHref}
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2.5 rounded-button px-3 py-2.5 text-[14.5px] font-medium text-violet-600 hover:bg-violet-50"
            >
              <Shield className="size-5" strokeWidth={1.5} />
              ניהול המערכת
            </Link>
          )}
          <SignOutButton />
        </MobileSheet>
      )}

      {moreOpen && overflowItems.length > 0 && (
        <MobileSheet title="עוד" onClose={() => setMoreOpen(false)}>
          {overflowItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href}
              onClick={() => setMoreOpen(false)}
            />
          ))}
        </MobileSheet>
      )}
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

function BottomNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text-muted",
        active && "text-violet-700",
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2 : 1.5} />
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

/** מגירה תחתונה למובייל (תפריט מלא / "עוד") — e-3, r-modal בפינות העליונות. */
function MobileSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 md:hidden">
      <button
        type="button"
        aria-label="סגירה"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col rounded-t-modal bg-surface shadow-e3">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-base font-semibold text-foreground">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-button hover:bg-subtle"
            aria-label="סגירה"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}
