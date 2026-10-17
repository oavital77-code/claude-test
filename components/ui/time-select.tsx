import * as React from "react";

import { cn } from "@/lib/utils";
import { halfHourTimes } from "@/lib/time/half-hours";

/**
 * בחירת שעה בפורמט ישראלי (24 שעות, HH:mm) בקפיצות של חצי שעה.
 *
 * במקום <input type="time">: השדה הנייטיב מוצג לפי הגדרות המחשב/הטלפון של
 * המשתמש — באנגלית-ארה"ב זה AM/PM ("09:00 AM", דקות 32/33...). כאן התצוגה
 * זהה אצל כולם. אותו API כמו select רגיל: value/onChange(e.target.value).
 */
function TimeSelect({ className, value, ...props }: Omit<React.ComponentProps<"select">, "children">) {
  const current = typeof value === "string" ? value.slice(0, 5) : "";
  const options = halfHourTimes();
  // ערך קיים שלא על חצי שעה / מחוץ לטווח — מוצג כמו שהוא ולא נעלם.
  if (current && !options.includes(current)) options.push(current);
  options.sort();

  return (
    <select
      data-slot="time-select"
      dir="ltr"
      value={current}
      className={cn(
        "flex h-12 w-full rounded-field border border-border-strong bg-surface px-3 py-2 text-[14.5px] tabular-nums transition-colors focus-visible:outline-none focus-visible:border-violet-500 focus-visible:[box-shadow:var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-subtle disabled:text-grey-400 md:h-10",
        className,
      )}
      {...props}
    >
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

export { TimeSelect };
