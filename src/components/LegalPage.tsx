import Link from "next/link";
import Header from "./Header";
import Footer from "./Footer";

export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14 md:py-20">
          <Link href="/" className="text-sm font-medium text-navy hover:underline">
            ← חזרה לעמוד הבית
          </Link>

          <h1 className="mt-6 text-3xl font-extrabold text-navy sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-ink/50">עודכן לאחרונה: {updated}</p>

          <div className="prose-legal mt-10 space-y-8">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
