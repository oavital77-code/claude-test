import Image from "next/image";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-gold" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
      <path
        d="M6 10.5l2.5 2.5 5.5-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

const materialLayers = [
  "מעטפת חיצונית מבד פיברגלס מצופה סיליקון – עמידה בחום ובשחיקה",
  "שכבת בידוד מסיבי קרמיקה – מאטה את קצב מעבר החום פנימה",
  "ריפוד פנימי מבד סיליקה ארוג בריכוז גבוה – מחסום ישיר סביב תא הסוללה",
  "לוחית אלומיניום ופס רפלקטיבי בתחתית – פיזור חום וחסימת קרינה",
  "רוכסן חסין אש עם סרט תפר ייעודי לשמירה על אטימות בחום",
  "פתח טעינה אטום עם שסתום ניקוז לחץ ומעצור להבה למניעת פליטת סילון אש",
];

const smartFeatures = [
  "בקר מרכזי (ESP32) עם קישוריות Bluetooth ו-Wi-Fi",
  "שני חיישני טמפרטורה – חיצוני ופנימי – לניטור רציף",
  "חיישן גז לזיהוי פליטות חריגות מהסוללה",
  "ניתוק זרם אוטומטי כפול: MOSFET בשילוב נתיך תרמי גיבוי",
  "נורית סטטוס וזמזם להתראה מקומית מיידית",
  "התראה לאפליקציה תוך שניות ספורות ממקרה חריג",
];

export default function SolutionSection() {
  return (
    <section id="product" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold text-navy sm:text-4xl">
          שתי שכבות הגנה, פועלות יחד
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-ink/70">
          Voltsafe משלב מבנה רב-שכבתי מחומרים חסיני אש עם מערכת אלקטרונית
          לניטור וניתוק אוטומטי – הגנה חומרית פסיבית לצד הגנה חכמה פעילה.
        </p>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-steel-light bg-white p-8 shadow-sm">
          <h3 className="text-xl font-bold text-navy">הגנה חומרית</h3>
          <p className="mt-1.5 text-sm text-ink/60">
            מבנה שכבות שתוכנן לבלום חום, להבה והתפרצויות
          </p>
          <ul className="mt-6 space-y-4">
            {materialLayers.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckIcon />
                <span className="text-sm leading-relaxed text-ink/80">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-navy/10 bg-navy p-8 shadow-sm">
          <h3 className="text-xl font-bold text-white">הגנה חכמה</h3>
          <p className="mt-1.5 text-sm text-steel-light/70">
            ניטור אלקטרוני רציף וניתוק אוטומטי בזמן אמת
          </p>
          <ul className="mt-6 space-y-4">
            {smartFeatures.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckIcon />
                <span className="text-sm leading-relaxed text-steel-light/90">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div id="technology" className="mt-16 grid items-center gap-10 rounded-3xl bg-cream p-8 md:grid-cols-[1.1fr,1fr] md:p-12">
        <div>
          <h3 className="text-2xl font-extrabold text-navy">איך זה עובד</h3>
          <div className="mt-8 space-y-6">
            {[
              { step: "01", title: "מזהה", body: "החיישנים עוקבים ברצף אחר טמפרטורה ואיתותי גז חריגים." },
              { step: "02", title: "מתריע", body: "נורית וזמזם מתריעים מקומית, והאפליקציה מקבלת התראה תוך שניות." },
              { step: "03", title: "מנתק", body: "מעל סף הבטיחות, מנגנון הניתוק האוטומטי מפסיק את הזרם החשמלי." },
            ].map((s) => (
              <div key={s.step} className="flex gap-4">
                <span className="text-2xl font-black text-gold">{s.step}</span>
                <div>
                  <p className="font-bold text-navy">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink/65">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-2xl shadow-lg">
          <Image
            src="/images/bag-open-electronics.jpg"
            alt="המערכת האלקטרונית של Voltsafe בתוך התיק"
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
