import WaitlistForm from "./WaitlistForm";

export default function WaitlistSection() {
  return (
    <section id="waitlist" className="bg-navy">
      <div className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
        <div>
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            הצטרפו לרשימת ההמתנה
          </h2>
          <p className="mt-5 text-base leading-relaxed text-steel-light/80">
            השאירו פרטים ותהיו בין הראשונים לדעת כש-Voltsafe יושק. מחיר
            ההשקה הצפוי: כ-230 ₪. ההרשמה ללא עלות וללא כל התחייבות לרכישה.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-xl sm:p-8">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
