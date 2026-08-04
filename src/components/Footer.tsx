import Link from "next/link";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-steel-light bg-white">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
          <div className="max-w-xs">
            <Logo showTagline />
            <p className="mt-4 text-sm leading-relaxed text-ink/55">
              תיק חסין אש עם ניטור חכם לטעינה ואחסון בטוחים יותר של סוללות
              ליתיום-יון.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-6 text-sm">
            <div>
              <p className="mb-3 font-bold text-navy">האתר</p>
              <ul className="space-y-2 text-ink/60">
                <li><a href="#product" className="hover:text-navy">המוצר</a></li>
                <li><a href="#specs" className="hover:text-navy">מפרט</a></li>
                <li><a href="#faq" className="hover:text-navy">שאלות נפוצות</a></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-bold text-navy">מידע משפטי</p>
              <ul className="space-y-2 text-ink/60">
                <li><Link href="/terms" className="hover:text-navy">תקנון האתר</Link></li>
                <li><Link href="/privacy" className="hover:text-navy">מדיניות פרטיות</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-bold text-navy">יצירת קשר</p>
              <ul className="space-y-2 text-ink/60">
                <li dir="ltr" className="text-right">
                  <a href="mailto:oavital77@gmail.com" className="hover:text-navy">
                    oavital77@gmail.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-steel-light pt-6 text-xs leading-relaxed text-ink/45">
          <p>© {new Date().getFullYear()} Voltsafe. כל הזכויות שמורות.</p>
          <p className="mt-2">
            המידע באתר זה מוצג למטרות מידע כלליות בלבד ואינו מהווה הצעה
            מחייבת או התחייבות חוזית. לפרטים המלאים ראו את{" "}
            <Link href="/terms" className="underline">תקנון האתר</Link>.
          </p>
        </div>
      </div>
    </footer>
  );
}
