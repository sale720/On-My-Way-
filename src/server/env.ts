import { z } from "zod";

const schema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    SMS_PROVIDER: z.enum(["console", "memory", "sandbox"]),
    // off = only offline methods (cash); sandbox = simulated gateway for every online method (never real money)
    PAYMENT_MODE: z.enum(["off", "sandbox"]).default("off"),
  })
  .superRefine((v, ctx) => {
    // Dev/test SMS providers never deliver real messages; refuse to run production with them.
    if (v.APP_ENV === "production") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMS_PROVIDER"],
        message:
          "No production SMS provider is integrated yet; 'console', 'memory' and 'sandbox' are not allowed when APP_ENV=production (see docs/INTEGRATIONS.md).",
      });
      if (v.PAYMENT_MODE === "sandbox") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["PAYMENT_MODE"], message: "PAYMENT_MODE=sandbox is not allowed in production." });
      }
    }
    if (v.APP_ENV === "test" && !/test/i.test(new URL(v.DATABASE_URL).pathname)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "APP_ENV=test requires a database whose name contains 'test' (isolation guard).",
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated configuration. Throws with a clear message on misconfiguration. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Exposed for tests that exercise validation rules. */
export function parseEnv(input: Record<string, string | undefined>) {
  return schema.safeParse(input);
}

/** Tests only: drop the cached config so a changed process.env takes effect. */
export function resetEnvCache() {
  if (process.env.APP_ENV !== "test") throw new Error("resetEnvCache is for tests only");
  cached = undefined;
}
