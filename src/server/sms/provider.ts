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

const g = globalThis as unknown as { smsProvider?: SmsProvider };

export function smsProvider(): SmsProvider {
  if (g.smsProvider) return g.smsProvider;
  const kind = env().SMS_PROVIDER;
  g.smsProvider = kind === "memory" ? new MemorySmsProvider() : new ConsoleSmsProvider();
  logger.info("sms.provider.selected", { provider: g.smsProvider.name });
  return g.smsProvider;
}
