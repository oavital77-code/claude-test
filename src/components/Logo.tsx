type LogoProps = {
  className?: string;
  mark?: "light" | "dark";
  showTagline?: boolean;
};

/**
 * Voltsafe wordmark + shield-bolt mark, built as inline SVG so it stays
 * crisp at any size instead of relying on a rasterized deck export.
 */
export default function Logo({ className = "", mark = "dark", showTagline = false }: LogoProps) {
  const textColor = mark === "dark" ? "#1b1f3b" : "#ffffff";
  const goldColor = "#eab308";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 48 48" className="h-8 w-8 shrink-0" aria-hidden="true">
        <path
          d="M24 3 L42 11 V22 C42 33 34.5 41.5 24 45 C13.5 41.5 6 33 6 22 V11 Z"
          fill={textColor}
        />
        <path d="M26 12 L15 26 H22.5 L20 36 L33 20 H25.5 Z" fill={goldColor} />
      </svg>
      <div className="leading-tight">
        <span
          className="block font-extrabold tracking-tight text-xl"
          style={{ color: textColor, fontFamily: "var(--font-rubik)" }}
        >
          Voltsafe
        </span>
        {showTagline && (
          <span
            className="block text-[10px] font-medium tracking-[0.15em] uppercase opacity-70"
            style={{ color: textColor }}
          >
            Real Protection. Made Simple.
          </span>
        )}
      </div>
    </div>
  );
}
