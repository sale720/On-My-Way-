import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit/audit";
import { logger } from "../logger";
import { notify } from "../notifications/service";
import type { Actor } from "../rbac/authorize";
import { env } from "../env";
import { gatewayByName, gatewayFor, isOnline } from "./methods";
import { SANDBOX_CARDS, SANDBOX_SIGNATURE_HEADER, signSandboxEvent } from "./sandbox";

/** Starts (or resumes) the hosted checkout for a booking waiting for online payment. */
export async function startCheckout(actor: Actor | null, bookingId: string): Promise<string> {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  const b = await db.booking.findUnique({ where: { id: bookingId }, include: { payments: true } });
  if (!b || b.customerId !== actor.id) throw new AppError("NOT_FOUND");
  if (b.status !== "PENDING_PAYMENT") throw new AppError("INVALID_TRANSITION");
  const payment = b.payments.find((p) => p.status === "PENDING" && p.method === b.paymentMethod);
  if (!payment || !isOnline(payment.method)) throw new AppError("INVALID_TRANSITION");
  const gateway = gatewayFor(payment.method);
  if (!gateway) throw new AppError("INTEGRATION_REQUIRED");
  if (payment.providerRef && payment.provider === gateway.name) return `/pay/${gateway.name}/${payment.providerRef}`;

  const charge = await gateway.createCharge({
    bookingId: b.id,
    amountHalalas: payment.amountHalalas,
    method: payment.method,
    idempotencyKey: `charge:${payment.id}`,
    returnUrl: `/bookings/${b.id}`,
  });
  const r = await db.payment.updateMany({
    where: { id: payment.id, providerRef: null },
    data: { provider: gateway.name, providerRef: charge.providerRef },
  });
  if (r.count === 0) {
    const fresh = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return `/pay/${gateway.name}/${fresh.providerRef}`;
  }
  return charge.redirectUrl ?? `/bookings/${b.id}`;
}

/**
 * Applies a gateway event. Same entry point for the HTTP webhook and the sandbox simulator.
 * - Signature is verified by the gateway adapter.
 * - Each (provider, eventId) is processed once; repeats return { duplicate: true }.
 */
export async function handleGatewayEvent(providerName: string, rawBody: string, headers: Record<string, string>) {
  const gateway = gatewayByName(providerName);
  if (!gateway) throw new AppError("NOT_FOUND");
  const event = await gateway.parseWebhook(rawBody, headers);
  const payment = await db.payment.findUnique({ where: { providerRef: event.providerRef }, include: { booking: { include: { salon: true } } } });
  if (!payment || payment.provider !== gateway.name) throw new AppError("NOT_FOUND");

  let needsRefund = false;
  try {
    await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: { provider: gateway.name, eventId: event.eventId, paymentId: payment.id, type: event.status, payload: JSON.parse(rawBody) },
      });
      const b = payment.booking;
      if (event.status === "PAID" || event.status === "AUTHORIZED") {
        if (payment.status === "VOIDED") {
          // We had given up on this payment (window expired / booking cancelled) but the gateway did take
          // the money. Record it truthfully and refund it — never keep money for a booking that is closed.
          await tx.payment.update({ where: { id: payment.id }, data: { status: event.status } });
          await tx.booking.update({ where: { id: b.id }, data: { paymentStatus: event.status } });
          needsRefund = true;
          return;
        }
        if (payment.status !== "PENDING") return; // already settled; event recorded only
        await tx.payment.update({ where: { id: payment.id }, data: { status: event.status } });
        await tx.booking.update({ where: { id: b.id }, data: { paymentStatus: event.status } });
        if (b.status === "PENDING_PAYMENT") {
          const acceptBy = new Date(Math.min(Date.now() + b.salon.acceptanceTimeoutMinutes * 60_000, b.startsAt.getTime()));
          await tx.booking.update({ where: { id: b.id }, data: { status: "PENDING_PROVIDER_ACCEPTANCE", acceptBy } });
          await tx.bookingStatusHistory.create({ data: { bookingId: b.id, from: "PENDING_PAYMENT", to: "PENDING_PROVIDER_ACCEPTANCE", actorId: null, reason: "payment_received" } });
          const managers = await tx.salonMembership.findMany({
            where: { salonId: b.salonId, status: "ACTIVE", OR: [{ role: { in: ["OWNER", "MANAGER"] } }, { id: b.staffMembershipId }] },
            select: { userId: true },
          });
          await notify(tx, managers.map((m) => m.userId), "booking.requested", { bookingId: b.id, number: b.number });
          await notify(tx, [b.customerId], "payment.paid", { bookingId: b.id, number: b.number });
        } else {
          // Money arrived for a booking that is no longer waiting (e.g. expired): give it back.
          needsRefund = true;
        }
      } else if (event.status === "FAILED") {
        if (payment.status !== "PENDING") return;
        await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
        const r = await tx.booking.updateMany({
          where: { id: b.id, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED", paymentStatus: "FAILED", cancelReason: "payment_failed" },
        });
        if (r.count) {
          await tx.bookingStatusHistory.create({ data: { bookingId: b.id, from: "PENDING_PAYMENT", to: "CANCELLED", actorId: null, reason: "payment_failed" } });
          await notify(tx, [b.customerId], "payment.failed", { bookingId: b.id, number: b.number });
        }
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      logger.info("payment.event.duplicate", { provider: gateway.name, eventId: event.eventId });
      return { duplicate: true as const };
    }
    throw e;
  }
  if (needsRefund) await refundBookingPayment(payment.bookingId, "paid_after_close");
  logger.info("payment.event", { provider: gateway.name, status: event.status, paymentId: payment.id });
  return { duplicate: false as const, status: event.status };
}

/**
 * Refunds the paid online payment of a booking. Idempotent: one Refund row per payment
 * (idempotencyKey), and a SUCCEEDED refund is never repeated. Runs after the booking change commits;
 * a failed attempt stays FAILED and can be retried by calling this again.
 */
export async function refundBookingPayment(bookingId: string, reason: string) {
  const payment = await db.payment.findFirst({ where: { bookingId, status: { in: ["PAID", "AUTHORIZED"] }, provider: { not: null } } });
  if (!payment || !payment.providerRef || !payment.provider) return null;
  const gateway = gatewayByName(payment.provider);
  if (!gateway) throw new AppError("INTEGRATION_REQUIRED");
  const key = `refund:${payment.id}`;
  const refund = await db.refund.upsert({
    where: { idempotencyKey: key },
    create: { paymentId: payment.id, amountHalalas: payment.amountHalalas, idempotencyKey: key, reason },
    update: {},
  });
  if (refund.status === "SUCCEEDED") return refund;
  try {
    const res = await gateway.refund({ providerRef: payment.providerRef, amountHalalas: refund.amountHalalas, idempotencyKey: key });
    return await db.$transaction(async (tx) => {
      const done = await tx.refund.update({ where: { id: refund.id }, data: { status: "SUCCEEDED", providerRef: res.refundRef } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
      const b = await tx.booking.update({ where: { id: bookingId }, data: { paymentStatus: "REFUNDED" } });
      await audit(tx, {
        actorId: null,
        action: "payment.refunded",
        targetType: "Booking",
        targetId: bookingId,
        salonId: b.salonId,
        reason,
        metadata: { amountHalalas: refund.amountHalalas, provider: payment.provider, sandbox: payment.provider === "sandbox" },
      });
      await notify(tx, [b.customerId], "payment.refunded", { bookingId, number: b.number });
      return done;
    });
  } catch (e) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } });
    logger.error("payment.refund.failed", { bookingId, error: e });
    throw e;
  }
}

/**
 * Sandbox only: the customer "pays" on the sandbox checkout page. Produces a signed gateway event
 * and feeds it through exactly the same handler as a real webhook. No card data is stored.
 */
export async function simulateSandboxPayment(actor: Actor | null, providerRef: string, input: { outcome: "approve" | "decline"; cardNumber?: string }) {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  if (env().PAYMENT_MODE !== "sandbox") throw new AppError("NOT_FOUND");
  const payment = await db.payment.findUnique({ where: { providerRef }, include: { booking: true } });
  if (!payment || payment.provider !== "sandbox" || payment.booking.customerId !== actor.id) throw new AppError("NOT_FOUND");

  let status: "PAID" | "FAILED" = input.outcome === "approve" ? "PAID" : "FAILED";
  if (payment.method === "MADA" || payment.method === "CARD") {
    const digits = (input.cardNumber ?? "").replace(/\D/g, "");
    if (digits === SANDBOX_CARDS.approve) status = "PAID";
    else if (digits === SANDBOX_CARDS.decline) status = "FAILED";
    else throw new AppError("VALIDATION", "use a sandbox test card");
  }
  const rawBody = JSON.stringify({ eventId: `evt_${randomBytes(10).toString("hex")}`, providerRef, status });
  return handleGatewayEvent("sandbox", rawBody, { [SANDBOX_SIGNATURE_HEADER]: signSandboxEvent(rawBody) });
}

/** For the sandbox checkout page. */
export async function getSandboxCheckout(actor: Actor | null, providerRef: string) {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  if (env().PAYMENT_MODE !== "sandbox") throw new AppError("NOT_FOUND");
  const payment = await db.payment.findUnique({
    where: { providerRef },
    include: { booking: { include: { salon: { select: { name: true } }, items: true } } },
  });
  if (!payment || payment.provider !== "sandbox" || payment.booking.customerId !== actor.id) throw new AppError("NOT_FOUND");
  return payment;
}
