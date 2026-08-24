import { cn } from "@/lib/utils";

/**
 * סימן הלוגו — ריבוע מעוגל (squircle) בסגול המותג עם טבעת לבנה ונקודה
 * במרכז. צבעים קבועים (לא תלויי light/dark) לפי ה-brand kit — הסימן
 * נשאר עקבי בפני עצמו, רק הוורדמארק משתמש בצבע הטקסט של הדף.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("shrink-0", className)} aria-hidden="true">
      <rect width="100" height="100" rx="26" fill="#7A5AF8" />
      <circle cx="50" cy="50" r="26" fill="#FFFFFF" />
      <circle cx="50" cy="50" r="9" fill="#7A5AF8" />
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-7", markClassName)} />
      {showWordmark && (
        <span
          className={cn("font-semibold tracking-[-0.03em] text-foreground", wordmarkClassName)}
          style={{ fontFamily: "var(--font-outfit-logo)" }}
        >
          Cleana
        </span>
      )}
    </span>
  );
}
