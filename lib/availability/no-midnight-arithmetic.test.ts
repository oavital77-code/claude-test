import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// שומר מפני חזרת הבאג של 15/10/2026: בניית זמן שיבוץ כ"חצות + X שעות"
// (dayStart.getTime() + (h * 60 + m) * 60_000, או היסט במילישניות מחצות של יום
// אחר). ביום מעבר שעון זה מזיז בשעה. הדרך היחידה: israelDateTime(date, "HH:mm").
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\.getTime\(\)\s*\+\s*\(\s*\w+\s*\*\s*60\s*\+/, why: "חצות + (שעות*60+דקות) — השתמשו ב-israelDateTime" },
  { re: /offsetMs/, why: "היסט במילישניות בין ימים — השתמשו ב-israelDateTime(date, israelHHmm(slot))" },
  { re: /dayStart\.getTime\(\)\s*\+/, why: "חישוב מתחילת היום — השתמשו ב-israelDateTime" },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("אין בניית זמן מ'חצות + שעות' בקוד", () => {
  const root = join(__dirname, "..", "..");
  const files = ["app", "lib", "components"].flatMap((d) => sourceFiles(join(root, d)));

  it("נסרקו קבצים", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const { re, why } of FORBIDDEN) {
    it(why, () => {
      const hits = files.flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => (re.test(line) ? `${f.slice(root.length + 1)}:${i + 1}` : null))
          .filter((x): x is string => x !== null),
      );
      expect(hits).toEqual([]);
    });
  }
});
