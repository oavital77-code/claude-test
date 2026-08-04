import Image from "next/image";

const badges = [
  { label: "עמידות בחום עד 1000°C", note: "יעד הנדסי" },
  { label: "בידוד קרמי רב-שכבתי", note: "מדרגה עד 1260°C" },
  { label: "ניתוק זרם אוטומטי", note: "MOSFET + נתיך תרמי" },
  { label: "התראה חכמה לנייד", note: "Bluetooth / Wi-Fi" },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy-dark">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(234,179,8,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(43,49,99,0.6),transparent_50%)]" />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-gold-light">
            טכנולוגיית הגנה חכמה לסוללות ליתיום-יון
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
            הגנה אמיתית.
            <br />
            <span className="text-gold-light">פשוטה באמת.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-steel-light/90">
            Voltsafe הוא תיק טעינה ואחסון חכם, בנוי משכבות חומרים חסיני אש
            ומצויד בחיישני ניטור בזמן אמת – עבור סוללות ליתיום-יון של אופניים
            חשמליים, קורקינטים, כלי עבודה נטענים ומכשירים ניידים נוספים.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#waitlist"
              className="rounded-full bg-gold px-7 py-3.5 text-base font-bold text-navy-dark shadow-lg shadow-gold/20 transition hover:bg-gold-light"
            >
              הצטרפו לרשימת ההמתנה
            </a>
            <span className="text-sm text-steel-light/70">
              ללא עלות וללא התחייבות · נעדכן אתכם במועד ההשקה
            </span>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-8 sm:grid-cols-4">
            {badges.map((b) => (
              <div key={b.label}>
                <dt className="text-sm font-bold leading-snug text-white">
                  {b.label}
                </dt>
                <dd className="mt-1 text-xs text-steel-light/60">{b.note}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-gold/10 via-transparent to-navy-light/40 blur-2xl" />
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <Image
              src="/images/bag-hero-dark.jpg"
              alt="תיק Voltsafe חסין אש לסוללות ליתיום-יון"
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              priority
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
