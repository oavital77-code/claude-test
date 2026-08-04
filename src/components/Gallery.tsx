import Image from "next/image";

const images = [
  {
    src: "/images/bag-studio-badges.jpg",
    alt: "תיק Voltsafe – צילום סטודיו עם סימוני עמידות בחום ומשקל קל",
  },
  {
    src: "/images/lifestyle-beach.jpg",
    alt: "רוכב אופניים חשמליים נושא את תיק Voltsafe על הכתף",
  },
];

export default function Gallery() {
  return (
    <section className="bg-cream">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <h2 className="text-center text-3xl font-extrabold text-navy sm:text-4xl">
          עיצוב שנועד לשימוש יומיומי
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-base text-ink/65">
          קל, קומפקטי ונוח לנשיאה – מתאים לאופניים חשמליים, קורקינטים וכלי
          עבודה נטענים
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {images.map((img) => (
            <div
              key={img.src}
              className="relative aspect-square overflow-hidden rounded-3xl shadow-md"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover transition duration-500 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
