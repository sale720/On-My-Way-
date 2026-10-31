import { db } from "../db";
import { env } from "../env";
import { logger } from "../logger";

export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<void>;
}

/** Development only: prints the message to the server log. Never delivers anything. */
class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";
  async send(to: string, body: string) {
    // Deliberately bypasses the redacting logger so a developer can read the OTP locally.
    console.log(`[DEV SMS — not delivered] to=${to} body=${body}`);
  }
}

/** Automated tests only: keeps messages in memory so tests can read the OTP. */
export class MemorySmsProvider implements SmsProvider {
  readonly name = "memory";
  readonly outbox: { to: string; body: string; at: Date }[] = [];
  async send(to: string, body: string) {
    this.outbox.push({ to, body, at: new Date() });
  }
  lastTo(to: string) {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}

/**
 * Sandbox: stores the message in the database so it can be read in the in-app test inbox (/dev/sms).
 * Nothing is delivered to any phone. Refused in production by env validation.
 */
export class SandboxSmsProvider implements SmsProvider {
  readonly name = "sandbox";
  async send(to: string, body: string) {
    await db.smsMessage.create({ data: { provider: this.name, to, body } });
  }
}

/** Sandbox inbox is readable only when the sandbox provider is active outside production. */
export function sandboxInboxEnabled() {
  const e = env();
  return e.APP_ENV !== "production" && e.SMS_PROVIDER === "sandbox";
}

export async function listSandboxSms(phone?: string, take = 30) {
  if (!sandboxInboxEnabled()) return null;
  return db.smsMessage.findMany({
    where: phone ? { to: phone } : undefined,
    orderBy: { createdAt: "desc" },
    take,
  });
}

const g = globalThis as unknown as { smsProvider?: SmsProvider };

export function smsProvider(): SmsProvider {
  if (g.smsProvider) return g.smsProvider;
  const kind = env().SMS_PROVIDER;
  g.smsProvider =
    kind === "memory" ? new MemorySmsProvider() : kind === "sandbox" ? new SandboxSmsProvider() : new ConsoleSmsProvider();
  logger.info("sms.provider.selected", { provider: g.smsProvider.name });
  return g.smsProvider;
}
