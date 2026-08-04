"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

export default function WaitlistForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!agreed) {
      setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להירשם");
      return;
    }

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || ""),
      phone: String(data.get("phone") || ""),
      email: String(data.get("email") || ""),
    };

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "אירעה שגיאה, נסו שוב");
        setStatus("error");
        return;
      }
      setStatus("success");
      form.reset();
      setAgreed(false);
    } catch {
      setError("אירעה שגיאת רשת, נסו שוב");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-gold/30 bg-gold/10 p-8 text-center">
        <p className="text-lg font-bold text-navy">נרשמתם בהצלחה!</p>
        <p className="mt-2 text-sm text-ink/70">
          נעדכן אתכם ברגע שיהיה מועד השקה רשמי ל-Voltsafe.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink/80">
            שם מלא
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            className="w-full rounded-xl border border-steel-light bg-white px-4 py-3 text-sm outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            placeholder="ישראל ישראלי"
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink/80">
            טלפון
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            dir="ltr"
            className="w-full rounded-xl border border-steel-light bg-white px-4 py-3 text-sm outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            placeholder="050-0000000"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink/80">
            אימייל
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            dir="ltr"
            className="w-full rounded-xl border border-steel-light bg-white px-4 py-3 text-sm outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            placeholder="name@example.com"
          />
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink/60">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-steel-light text-navy focus:ring-navy/20"
        />
        <span>
          קראתי ואני מסכים/ה{" "}
          <a href="/terms" target="_blank" className="font-medium text-navy underline">
            לתנאי השימוש
          </a>{" "}
          ול
          <a href="/privacy" target="_blank" className="font-medium text-navy underline">
            מדיניות הפרטיות
          </a>
        </span>
      </label>

      {error && <p className="text-sm font-medium text-ember">{error}</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-xl bg-navy px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-navy-light disabled:opacity-60"
      >
        {status === "loading" ? "שולח..." : "עדכנו אותי"}
      </button>
    </form>
  );
}
