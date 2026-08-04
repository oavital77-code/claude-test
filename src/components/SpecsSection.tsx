const specs = [
  { label: "עמידות חום – מעטפת חיצונית", value: "עד 1000°C" },
  { label: "דירוג הבידוד הקרמי", value: "עד מדרגה של 1260°C" },
  { label: "ריכוז סיליקה – ריפוד פנימי", value: "מעל 96%" },
  { label: "עמידות בפני להבה חיצונית", value: "120 שניות ומעלה ללא חדירה" },
  { label: "טמפ' משטח חיצוני לאחר אירוע פנימי מדומה", value: "עד 90°C תוך 60 שניות" },
  { label: "סף ניתוק זרם אוטומטי", value: "מעל 70°C או זיהוי חריגת גז" },
  { label: "זמן התראה לאפליקציה", value: "עד 3 שניות" },
  { label: "קישוריות", value: "Bluetooth + Wi-Fi" },
];

export default function SpecsSection() {
  return (
    <section id="specs" className="bg-navy-dark">
      <div className="mx-auto max-w-4xl px-5 py-16 md:py-24">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            יעדי ביצועים הנדסיים
          </h2>
          <p className="mt-4 text-base text-steel-light/70">
            הנתונים הבאים מבוססים על מפרט הפיתוח ובדיקות פנימיות וברמת
            החומרים של Voltsafe
          </p>
        </div>

        <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2">
          {specs.map((s) => (
            <div key={s.label} className="bg-navy-dark p-6">
              <dt className="text-sm text-steel-light/60">{s.label}</dt>
              <dd className="mt-1.5 text-lg font-bold text-gold-light">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-steel-light/50">
          * הנתונים משקפים יעדי פיתוח הנדסיים ותוצאות בדיקות פנימיות ו/או
          ברמת חומרי הגלם. המפרט הסופי, העיצוב וההסמכות הרגולטוריות של המוצר
          המוגמר עשויים להתעדכן בהתאם להתקדמות תהליכי הפיתוח, הייצור וההסמכה.
        </p>
      </div>
    </section>
  );
}
