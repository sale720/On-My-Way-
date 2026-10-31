type Level = "debug" | "info" | "warn" | "error";

const SECRET_KEYS = /^(code|otp|token|password|secret|authorization|cookie|codeHash|tokenHash)$/i;

export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 4)}****${phone.slice(-2)}` : "****";
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEYS.test(k)) out[k] = "[REDACTED]";
    else if (k === "phone" && typeof v === "string") out[k] = maskPhone(v);
    else out[k] = redact(v, depth + 1);
  }
  return out;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (process.env.APP_ENV === "test" && level !== "error" && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(redact(fields ?? {}) as object) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/** Structured JSON logger. Secret-looking keys are redacted and phone numbers masked. */
export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};

export const __test__ = { redact };
