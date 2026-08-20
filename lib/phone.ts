/**
 * נורמליזציה של מספר טלפון ישראלי לפורמט E.164 (נדרש ע"י Supabase phone auth).
 * מקבל "05XXXXXXXX", "5XXXXXXXX", "+9725XXXXXXXX" או "9725XXXXXXXX".
 */
export function toE164Israel(rawInput: string): string | null {
  const digits = rawInput.replace(/[^\d]/g, "");

  let local: string | null = null;
  if (digits.startsWith("972")) {
    local = digits.slice(3);
  } else if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else {
    local = digits;
  }

  if (!/^5\d{8}$/.test(local)) return null;

  return `+972${local}`;
}

export function formatIsraeliPhoneDisplay(e164: string): string {
  const match = e164.match(/^\+972(\d{9})$/);
  if (!match) return e164;
  const local = `0${match[1]}`;
  return `${local.slice(0, 3)}-${local.slice(3)}`;
}
