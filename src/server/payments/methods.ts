import type { PaymentMethod } from "@prisma/client";

/**
 * Payment method registry (decision D-014: every method is supported and individually switchable).
 *
 * `integrated` reflects what is actually connected in code. Online methods need a payment-gateway
 * adapter (Phase 5); until then they are visible everywhere but cannot be enabled or used.
 * Changing `integrated` to true is only allowed together with a tested gateway adapter.
 */
export interface PaymentMethodInfo {
  method: PaymentMethod;
  kind: "offline" | "card" | "wallet" | "bnpl";
  integrated: boolean;
  /** What is needed before this method can be switched on. */
  requires: string | null;
}

export const PAYMENT_METHODS: readonly PaymentMethodInfo[] = [
  { method: "CASH", kind: "offline", integrated: true, requires: null },
  { method: "MADA", kind: "card", integrated: false, requires: "gateway" },
  { method: "CARD", kind: "card", integrated: false, requires: "gateway" },
  { method: "APPLE_PAY", kind: "wallet", integrated: false, requires: "gateway+apple_merchant" },
  { method: "STC_PAY", kind: "wallet", integrated: false, requires: "gateway" },
  { method: "TABBY", kind: "bnpl", integrated: false, requires: "bnpl_contract" },
  { method: "TAMARA", kind: "bnpl", integrated: false, requires: "bnpl_contract" },
];

export const methodInfo = (m: PaymentMethod) => PAYMENT_METHODS.find((p) => p.method === m)!;

/** Default platform switch when no admin decision is stored: only integrated offline cash is on. */
export const defaultPlatformEnabled = (m: PaymentMethod) => m === "CASH";

/**
 * Contract a gateway adapter must fulfil (Phase 5). Declared now so booking/payment code is written
 * against it; no implementation exists yet and nothing pretends to charge a card.
 */
export interface PaymentGateway {
  readonly name: string;
  createCharge(input: {
    bookingId: string;
    amountHalalas: number;
    method: PaymentMethod;
    idempotencyKey: string;
    returnUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string | null }>;
  refund(input: { providerRef: string; amountHalalas: number; idempotencyKey: string }): Promise<{ refundRef: string }>;
  /** Verifies a webhook signature and returns the normalized event. */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<{
    providerRef: string;
    status: "AUTHORIZED" | "PAID" | "FAILED" | "REFUNDED";
    eventId: string;
  }>;
}

export function gatewayFor(_method: PaymentMethod): PaymentGateway | null {
  return null; // no gateway integrated yet
}
