import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatIsraeliDate } from "./israeli-date";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("formatIsraeliDate", () => {
  it("יום/חודש/שנה + יום בשבוע", () => {
    expect(formatIsraeliDate("2026-10-17")).toBe("17/10/2026 · שבת");
    expect(formatIsraeliDate("2026-11-03")).toBe("03/11/2026 · שלישי");
  });
  it("3 בנובמבר לא מתבלבל עם 11 במרץ", () => {
    expect(formatIsraeliDate("2026-11-03").startsWith("03/11")).toBe(true);
    expect(formatIsraeliDate("2027-03-11").startsWith("11/03")).toBe(true);
  });
  it("יום מעבר שעון — לא מושפע מאזור הזמן", () => {
    expect(formatIsraeliDate("2026-10-25")).toBe("25/10/2026 · ראשון");
  });
  it("ערך לא תקין מוחזר כמו שהוא", () => {
    expect(formatIsraeliDate("")).toBe("");
  });
});

// שמירה מפני רגרסיה: <input type="date"> מוצג לפי הגדרות המחשב (בארה"ב
// חודש/יום). כל בחירת תאריך עוברת דרך components/ui/date-input.tsx, שהוא
// המקום היחיד שמשתמש בשדה הנייטיב (שקוף, מתחת לתצוגה הישראלית).
describe('guard: אין type="date" מחוץ ל-DateInput', () => {
  it("כל השדות עוברים דרך DateInput", () => {
    const offenders = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))]
      .filter((f) => !f.endsWith(join("components", "ui", "date-input.tsx")))
      .filter((f) => /type=["{]+date["}]+/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
});
