import { z } from "zod";
import { AppError } from "./errors";

export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message);
  return r.data;
}

export const reasonSchema = z.string().trim().min(3).max(500);
export const idSchema = z.string().min(1).max(64);
/** SAR amount entered in riyals (e.g. "150" or "150.50") → halalas. */
export const sarToHalalas = z.coerce
  .number()
  .min(0)
  .max(1_000_000)
  .transform((v) => Math.round(v * 100));
