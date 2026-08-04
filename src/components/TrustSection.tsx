const badges = [
  { title: "נבדק במעבדת SGS", body: "בד המעטפת החיצונית (פיברגלס מצופה סיליקון) נבדק במעבדת SGS הבינלאומית" },
  { title: "דירוג UL94 · VTM-0", body: "תוצאת בדיקת הבערה אנכית (Vertical Burning) לבד המעטפת" },
  { title: "תקינה בתהליך", body: "פיתוח תוך התייחסות לדרישות IEC62133, UN38.3 ו-EMC לתחום סוללות הליתיום" },
];

export default function TrustSection() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-16 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold text-navy sm:text-4xl">
          מבוסס על סטנדרטים בינלאומיים
        </h2>
        <p className="mt-5 text-base leading-relaxed text-ink/70">
          חומר המעטפת החיצונית של Voltsafe נבדק במעבדה בלתי-תלויה, ותהליך
          הפיתוח של המוצר כולו מתייחס לדרישות תקינה בינלאומיות מקובלות
          בתחום בטיחות סוללות ליתיום-יון ומכשור אלחוטי.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {badges.map((b) => (
          <div
            key={b.title}
            className="rounded-2xl border border-steel-light bg-white p-6 text-center shadow-sm"
          >
            <p className="font-bold text-navy">{b.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">{b.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
