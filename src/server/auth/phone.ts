import { AppError } from "../errors";

/**
 * Normalises a Saudi mobile number to E.164 (+9665XXXXXXXX).
 * Accepted inputs: 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX (spaces/dashes ignored).
 * Saudi mobile numbers start with 5 after the country code and have 9 national digits.
 */
export function normalizeSaudiMobile(input: string): string {
  const digits = toAsciiDigits(input).replace(/[\s\-()]/g, "");
  const m = /^(?:\+?966|00966|0)?(5\d{8})$/.exec(digits);
  if (!m) throw new AppError("VALIDATION", "invalid_phone");
  return `+966${m[1]}`;
}

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits → ASCII. */
function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
