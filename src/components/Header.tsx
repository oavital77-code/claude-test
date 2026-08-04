import Link from "next/link";
import Logo from "./Logo";

const navLinks = [
  { href: "#product", label: "המוצר" },
  { href: "#technology", label: "הטכנולוגיה" },
  { href: "#specs", label: "מפרט" },
  { href: "#faq", label: "שאלות נפוצות" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-steel-light/60 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" aria-label="Voltsafe – עמוד הבית">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink/70 transition hover:text-navy"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href="#waitlist"
          className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-navy-light"
        >
          הצטרפו לרשימת ההמתנה
        </a>
      </div>
    </header>
  );
}
