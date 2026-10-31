import { z } from "zod";

const schema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    SMS_PROVIDER: z.enum(["console", "memory"]),
  })
  .superRefine((v, ctx) => {
    // Dev/test SMS providers never deliver real messages; refuse to run production with them.
    if (v.APP_ENV === "production") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMS_PROVIDER"],
        message:
          "No production SMS provider is integrated yet; 'console' and 'memory' are not allowed when APP_ENV=production (see docs/INTEGRATIONS.md).",
      });
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
