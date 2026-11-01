import { ArrowUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// קישור למערכת האחות Cleana+ (יומן וזימון תורים למטפלים עצמאיים). הצבעים
// לקוחים מהאתר החי שלה: --primary hsl(24 55% 50%), --background
// hsl(37 59% 90%), --accent hsl(41 71% 46%) — כדי שהלוגו ייראה בדיוק כמו שם.
export const CLEANA_PLUS_URL = "https://cleanaplus.cleanagroup.app/";

function CleanaPlusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="#C67139" />
      <circle cx="16" cy="16" r="7.25" fill="none" stroke="#F5E9D6" strokeWidth="3" />
    </svg>
  );
}

export function CleanaPlusLink({ onClick }: { onClick?: () => void }) {
  return (
    <a
      href={CLEANA_PLUS_URL}
      target="_blank"
      rel="noopener"
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-button px-3 py-2.5 transition-colors hover:bg-[#C67139]/10"
    >
      <CleanaPlusMark className="size-5" />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span dir="ltr" className="self-start text-[14.5px] font-semibold text-foreground" style={{ fontFamily: "var(--font-outfit-logo)" }}>
          Cleana<span className="text-[#C89422]">+</span>
        </span>
        <span className="text-[12px] text-text-muted">מערכת לניהול תורים למטפלים</span>
      </span>
      <ArrowUpLeft className="size-4 shrink-0 text-text-muted transition-colors group-hover:text-[#C67139]" />
    </a>
  );
}
