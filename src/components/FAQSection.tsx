const faqs = [
  {
    q: "האם Voltsafe מבטיח מניעה מוחלטת של שריפה?",
    a: "לא. שום מוצר אינו יכול להבטיח מניעה מוחלטת של שריפה, נזק או פציעה. Voltsafe תוכנן לצמצם סיכונים ולעכב התפשטות אש באמצעות שילוב של חומרים חסיני אש וניטור חכם, אך יש להשתמש בו כאמצעי משלים בלבד – בנוסף להנחיות היצרן של הסוללה, המטען או המכשיר הנטען, ולא במקומן.",
  },
  {
    q: "אילו מכשירים מתאימים לשימוש עם Voltsafe?",
    a: "התיק מיועד לאחסון ולטעינה של סוללות ליתיום-יון נפוצות – כגון סוללות של אופניים חשמליים, קורקינטים חשמליים, כלי עבודה נטענים ומכשירים ניידים נוספים המבוססים על סוללות מסוג זה.",
  },
  {
    q: "מתי המוצר יגיע לשוק?",
    a: "Voltsafe נמצא כעת בשלבי פיתוח מתקדמים. נרשמים לרשימת ההמתנה יקבלו עדכון ברגע שיתפרסם מועד השקה רשמי.",
  },
  {
    q: "האם ההרשמה לרשימת ההמתנה כרוכה בתשלום או בהתחייבות לרכישה?",
    a: "לא. ההרשמה היא ללא עלות וללא כל התחייבות לרכישה. פרטים על תהליך רכישה, לרבות מחיר סופי ותנאי מכירה, יפורסמו בנפרד במועד ההשקה.",
  },
  {
    q: "מה המחיר הצפוי?",
    a: "מחיר ההשקה הצפוי עומד על כ-230 ₪, בכפוף לשינויים עד למועד ההשקה הרשמי של המוצר.",
  },
];

export default function FAQSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-16 md:py-24">
      <h2 className="text-center text-3xl font-extrabold text-navy sm:text-4xl">
        שאלות נפוצות
      </h2>

      <div className="mt-10 divide-y divide-steel-light">
        {faqs.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold text-navy marker:content-['']">
              {item.q}
              <span className="shrink-0 text-2xl font-light text-gold transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
