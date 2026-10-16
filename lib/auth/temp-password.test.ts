import { describe, expect, it } from "vitest";
import { authFormSchema, newPasswordSchema } from "@/lib/validation/registration";
import { generateTemporaryPassword } from "./temp-password";

// Supabase Auth: הסימנים המותרים בדרישת "symbols" בהגדרות חוזק הסיסמה.
const SUPABASE_SYMBOLS = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

describe("generateTemporaryPassword", () => {
  const samples = Array.from({ length: 2000 }, generateTemporaryPassword);

  it("עומדת בכל דרישות החוזק האפשריות (גדולה, קטנה, ספרה, סימן, 8+)", () => {
    for (const p of samples) {
      expect(p.length).toBeGreaterThanOrEqual(8);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(SUPABASE_SYMBOLS);
    }
  });

  it("בלי תווים שמתבלבלים (0 O 1 l I)", () => {
    for (const p of samples) expect(p).not.toMatch(/[0O1lI]/);
  });

  it("עוברת את ולידציית מסך ההתחברות ואת מסך בחירת הסיסמה", () => {
    for (const p of samples.slice(0, 50)) {
      expect(authFormSchema.safeParse({ email: "a@b.co", password: p }).success).toBe(true);
      expect(newPasswordSchema.safeParse({ password: p, confirm: p }).success).toBe(true);
    }
  });

  it("אקראית (אין כפילויות במדגם)", () => {
    expect(new Set(samples).size).toBeGreaterThan(1990);
  });
});
