import type { BookingStatus } from "@prisma/client";

/**
 * Booking lifecycle (docs/BOOKING_LIFECYCLE.md). A transition is legal only if listed here,
 * and only for the listed capacities. Anything else is rejected with INVALID_TRANSITION.
 *
 * Capacities:
 *   customer  – the customer who made the booking
 *   provider  – the assigned staff member
 *   salon     – salon owner/manager (salon.bookings.manage)
 *   platform  – platform staff (platform.bookings.manage)
 *   system    – automatic (e.g. acceptance timeout, payment webhook)
 *
 * Reserved for later phases (declared in the schema, no transitions yet):
 *   DRAFT, PENDING_AVAILABILITY_CHECK, ASSIGNED.
 */
export type Capacity = "customer" | "provider" | "salon" | "platform" | "system";

type Rule = { to: BookingStatus; by: Capacity[]; reasonRequired?: boolean };

export const TRANSITIONS: Partial<Record<BookingStatus, Rule[]>> = {
  PENDING_PROVIDER_ACCEPTANCE: [
    { to: "CONFIRMED", by: ["provider", "salon"] },
    { to: "REJECTED", by: ["provider", "salon"], reasonRequired: true },
    { to: "CANCELLED", by: ["customer", "salon", "platform", "system"] },
  ],
  // Online payment first; once the gateway reports PAID the request goes to the provider.
  PENDING_PAYMENT: [
    { to: "PENDING_PROVIDER_ACCEPTANCE", by: ["system"] },
    { to: "CANCELLED", by: ["customer", "platform", "system"] },
  ],
  CONFIRMED: [
    { to: "PROVIDER_EN_ROUTE", by: ["provider", "salon"] },
    { to: "CANCELLED", by: ["customer", "salon", "platform"], reasonRequired: true },
  ],
  PROVIDER_EN_ROUTE: [
    { to: "PROVIDER_ARRIVED", by: ["provider", "salon"] },
    { to: "CANCELLED", by: ["salon", "platform"], reasonRequired: true },
  ],
  PROVIDER_ARRIVED: [
    { to: "IN_PROGRESS", by: ["provider", "salon"] },
    { to: "NO_SHOW", by: ["provider", "salon"], reasonRequired: true },
  ],
  IN_PROGRESS: [{ to: "COMPLETED", by: ["provider", "salon"] }],
  COMPLETED: [{ to: "DISPUTED", by: ["customer", "platform"], reasonRequired: true }],
  DISPUTED: [
    { to: "COMPLETED", by: ["platform"], reasonRequired: true },
    { to: "REFUND_PENDING", by: ["platform"], reasonRequired: true },
  ],
  REFUND_PENDING: [
    { to: "REFUNDED", by: ["platform", "system"] },
    { to: "PARTIALLY_REFUNDED", by: ["platform", "system"] },
  ],
};

export const TERMINAL: BookingStatus[] = ["CANCELLED", "REJECTED", "NO_SHOW", "REFUNDED", "PARTIALLY_REFUNDED"];

/** Statuses after which the provider may see the full street address. */
export const ADDRESS_VISIBLE_TO_PROVIDER: BookingStatus[] = [
  "CONFIRMED",
  "ASSIGNED",
  "PROVIDER_EN_ROUTE",
  "PROVIDER_ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
  "DISPUTED",
];

export function findRule(from: BookingStatus, to: BookingStatus, capacities: Capacity[]): Rule | null {
  const rule = TRANSITIONS[from]?.find((r) => r.to === to);
  if (!rule) return null;
  return rule.by.some((c) => capacities.includes(c)) ? rule : null;
}

/** Transitions a set of capacities may perform from a status (for rendering action buttons). */
export function allowedNext(from: BookingStatus, capacities: Capacity[]): Rule[] {
  return (TRANSITIONS[from] ?? []).filter((r) => r.by.some((c) => capacities.includes(c)));
}
