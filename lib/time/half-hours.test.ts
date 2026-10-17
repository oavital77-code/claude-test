import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { halfHourTimes } from "./half-hours";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("halfHourTimes", () => {
  const times = halfHourTimes();

  it("פורמט 24 שעות HH:mm בלבד — בלי AM/PM", () => {
    for (const t of times) expect(t).toMatch(/^([01]\d|2[0-3]):(00|30)$/);
  });

  it("קפיצות של חצי שעה, ממוינות, כולל שעות אחה״צ בפורמט 13–23", () => {
    expect(times).toContain("13:00");
    expect(times).toContain("21:30");
    expect([...times].sort()).toEqual(times);
    expect(new Set(times).size).toBe(times.length);
  });

  it("מכסה את כל טווח הלוח (07:00–22:00)", () => {
    expect(times).toContain("07:00");
    expect(times).toContain("22:00");
  });
});

// שמירה מפני רגרסיה: <input type="time"> מוצג לפי הגדרות המחשב — אצל מי
// שהמחשב שלו באנגלית-ארה"ב זה AM/PM (התגלה אצל אדמין ומטפלות, 17/10).
// כל בחירת שעה עוברת דרך components/ui/time-select.tsx.
describe("guard: אין שדה שעה נייטיב", () => {
  it('אין type="time" באף רכיב', () => {
    const offenders = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))].filter((f) =>
      /type=["{]+time["}]+/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")),
    );
    expect(offenders).toEqual([]);
  });
});
