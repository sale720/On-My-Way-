import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { AppError } from "../errors";
import type { PaymentGateway } from "./methods";

/**
 * SANDBOX payment gateway. It behaves like a hosted-checkout gateway (charge → redirect → signed
 * webhook → refund) so the whole payment flow can be exercised end to end — but no money moves and
 * no card data is processed. Refused in production by env validation (PAYMENT_MODE=sandbox).
 *
 * Test cards (card-type methods):
 *   4111 1111 1111 1111 → approved
 *   4000 0000 0000 0002 → declined
 * Wallet / BNPL methods: "approve" or "decline" buttons on the sandbox checkout page.
 */
export const SANDBOX_CARDS = { approve: "4111111111111111", decline: "4000000000000002" } as const;
export const SANDBOX_SIGNATURE_HEADER = "x-sandbox-signature";

function webhookSecret() {
  return createHash("sha256").update(`sandbox-webhook:${env().AUTH_SECRET}`).digest();
}

export function signSandboxEvent(rawBody: string): string {
  return createHmac("sha256", webhookSecret()).update(rawBody).digest("hex");
}

export const sandboxGateway: PaymentGateway = {
  name: "sandbox",
  async createCharge({ amountHalalas }) {
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) throw new AppError("VALIDATION", "amount");
    const providerRef = `sbx_${randomBytes(10).toString("hex")}`;
    return { providerRef, redirectUrl: `/pay/sandbox/${providerRef}` };
  },
  async refund({ amountHalalas }) {
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) throw new AppError("VALIDATION", "amount");
    return { refundRef: `sbxr_${randomBytes(10).toString("hex")}` };
  },
  async parseWebhook(rawBody, headers) {
    const given = headers[SANDBOX_SIGNATURE_HEADER] ?? "";
    const expected = signSandboxEvent(rawBody);
    const a = Buffer.from(given, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError("FORBIDDEN", "bad signature");
    const body = JSON.parse(rawBody) as { eventId?: string; providerRef?: string; status?: string };
    if (!body.eventId || !body.providerRef || !["AUTHORIZED", "PAID", "FAILED", "REFUNDED"].includes(body.status ?? "")) {
      throw new AppError("VALIDATION", "malformed event");
    }
    return { eventId: body.eventId, providerRef: body.providerRef, status: body.status as "AUTHORIZED" | "PAID" | "FAILED" | "REFUNDED" };
  },
};
