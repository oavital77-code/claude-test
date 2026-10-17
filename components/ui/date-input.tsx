"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatIsraeliDate } from "@/lib/time/israeli-date";

/**
 * שדה תאריך בפורמט ישראלי (17/10/2026 · שישי) — זהה אצל כולם.
 *
 * <input type="date"> מציג את התאריך לפי הגדרות המחשב: באנגלית-ארה"ב
 * חודש/יום/שנה (10/17/2026), ו-03/11 יכול להיות 3 בנובמבר או 11 במרץ. כאן
 * התצוגה שלנו, ומתחתיה שדה התאריך הנייטיב שקוף — לחיצה (בנייד ובמחשב)
 * פותחת את בורר התאריכים של המערכת. הערך נשאר yyyy-MM-dd, אותו API כמו
 * input רגיל: value / onChange(e.target.value) / min / max.
 */
function DateInput({
  className,
  value,
  placeholder = "בחירת תאריך",
  onClick,
  "aria-label": ariaLabel,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { placeholder?: string }) {
  const label = typeof value === "string" && value ? formatIsraeliDate(value) : "";

  return (
    <div
      data-slot="date-input"
      // position ב-style ולא רק במחלקה: השדה השקוף חייב לכסות את כל התיבה
      // כדי שלחיצה בכל מקום תפתח את הבורר — לא תלוי בטעינת ה-CSS.
      style={{ position: "relative" }}
      className={cn(
        "relative flex h-12 w-full items-center gap-2 rounded-field border border-border-strong bg-surface px-3 text-[14.5px] transition-colors focus-within:border-violet-500 focus-within:[box-shadow:var(--focus-ring)] md:h-10",
        props.disabled && "cursor-not-allowed bg-subtle text-grey-400",
        className,
      )}
    >
      <CalendarDays className="size-4 shrink-0 text-text-muted" aria-hidden />
      <span className={cn("truncate tabular-nums", !label && "text-text-muted")}>{label || placeholder}</span>
      <input
        {...props}
        type="date"
        value={value}
        aria-label={ariaLabel ?? (label || placeholder)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          padding: 0,
          border: 0,
          boxSizing: "border-box",
          opacity: 0,
        }}
        className="cursor-pointer disabled:cursor-not-allowed"
        onClick={(e) => {
          // במחשב, לחיצה על השדה השקוף לא תמיד פותחת את הבורר — showPicker כן.
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // דפדפן ישן / בלי user activation — הלחיצה הרגילה עדיין עובדת בנייד
          }
          onClick?.(e);
        }}
      />
    </div>
  );
}

export { DateInput };
