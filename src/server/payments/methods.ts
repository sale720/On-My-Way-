import type { PaymentMethod } from "@prisma/client";
import { env } from "../env";
import { sandboxGateway } from "./sandbox";

/**
 * Payment method registry (decision D-014: every method is supported and individually switchable).
 *
 * `integrated` = a LIVE provider is connected in code (real money). Today only cash qualifies.
 * In PAYMENT_MODE=sandbox every online method is routed to the sandbox gateway: usable for testing,
 * clearly labelled, never real money. Without sandbox mode, online methods are visible but unusable.
 */
export interface PaymentMethodInfo {
  method: PaymentMethod;
  kind: "offline" | "card" | "wallet" | "bnpl";
  integrated: boolean;
  /** What is needed before this method can go live. */
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

/** How a method can currently be used: LIVE (real), SANDBOX (simulated), NONE (not usable). */
export type MethodMode = "LIVE" | "SANDBOX" | "NONE";

export function methodMode(m: PaymentMethod): MethodMode {
  const info = methodInfo(m);
  if (info.integrated) return "LIVE";
  return env().PAYMENT_MODE === "sandbox" ? "SANDBOX" : "NONE";
}

export const isOnline = (m: PaymentMethod) => methodInfo(m).kind !== "offline";

/** Default platform switch when no admin decision is stored: only integrated offline cash is on. */
export const defaultPlatformEnabled = (m: PaymentMethod) => m === "CASH";

/**
 * Contract a gateway adapter must fulfil. The sandbox gateway implements it today; a live adapter
 * (Phase 5) must implement the same contract and pass the same tests before `integrated` becomes true.
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

export function gatewayFor(method: PaymentMethod): PaymentGateway | null {
  return isOnline(method) && methodMode(method) === "SANDBOX" ? sandboxGateway : null;
}

export function gatewayByName(name: string): PaymentGateway | null {
  return name === "sandbox" && env().PAYMENT_MODE === "sandbox" ? sandboxGateway : null;
}
