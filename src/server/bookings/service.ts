import type { Booking, BookingStatus, PaymentMethod } from "@prisma/client";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db, type Db } from "../db";
import { AppError, isAppError } from "../errors";
import { audit } from "../audit/audit";
import { logger } from "../logger";
import { hasPlatformPermission, requirePlatformPermission, requireSalonPermission, type Actor } from "../rbac/authorize";
import { salonRoleHas } from "../rbac/permissions";
import { ownedAddress } from "../geo/service";
import { computeQuote } from "../pricing/quote";
import { getSettings } from "../settings/service";
import { isSelectable, salonPaymentMethodStatuses } from "../payments/service";
import { isOnline } from "../payments/methods";
import { refundBookingPayment } from "../payments/checkout";
import { notify } from "../notifications/service";
import { riyadhDate } from "../time";
import { parse } from "../validation";
import { evaluateService, slotsByStaff } from "./search";
import { ADDRESS_VISIBLE_TO_PROVIDER, allowedNext, findRule, type Capacity } from "./state";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const newNumber = () => `OMW-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

/** True when PostgreSQL rejected the row because the provider's time is already reserved. */
function isOverlapViolation(e: unknown) {
  const text = e instanceof Error ? `${e.message} ${JSON.stringify((e as { meta?: unknown }).meta ?? {})}` : String(e);
  return text.includes("booking_no_overlap_per_provider") || text.includes("23P01");
}

async function salonManagersAndStaff(tx: Db, salonId: string, staffMembershipId: string) {
  const ms = await tx.salonMembership.findMany({
    where: { salonId, status: "ACTIVE", OR: [{ role: { in: ["OWNER", "MANAGER"] } }, { id: staffMembershipId }] },
    select: { userId: true },
  });
  return ms.map((m) => m.userId);
}

/** Pending requests the provider did not answer in time are cancelled automatically (lazy; also callable by a scheduler). */
/**
 * Pending steps that ran out of time are cancelled automatically (lazy; also callable by a scheduler):
 *   PENDING_PAYMENT             → CANCELLED "payment_timeout"     (payment window passed)
 *   PENDING_PROVIDER_ACCEPTANCE → CANCELLED "acceptance_timeout"  (provider did not answer) — a paid online payment is refunded
 */
export async function expireStalePendingBookings(now = new Date()) {
  const stale = await db.booking.findMany({
    where: { status: { in: ["PENDING_PROVIDER_ACCEPTANCE", "PENDING_PAYMENT"] }, acceptBy: { lt: now } },
    select: { id: true, customerId: true, number: true, status: true, paymentStatus: true },
    take: 200,
  });
  const toRefund: string[] = [];
  for (const b of stale) {
    const reason = b.status === "PENDING_PAYMENT" ? "payment_timeout" : "acceptance_timeout";
    const paid = b.paymentStatus === "PAID" || b.paymentStatus === "AUTHORIZED";
    const done = await db.$transaction(async (tx) => {
      const r = await tx.booking.updateMany({
        where: { id: b.id, status: b.status },
        data: { status: "CANCELLED", cancelReason: reason, ...(paid ? {} : { paymentStatus: "VOIDED" }) },
      });
      if (r.count === 0) return false;
      await tx.payment.updateMany({ where: { bookingId: b.id, status: "PENDING" }, data: { status: "VOIDED" } });
      await tx.bookingStatusHistory.create({ data: { bookingId: b.id, from: b.status, to: "CANCELLED", actorId: null, reason } });
      await notify(tx, [b.customerId], "booking.expired", { bookingId: b.id, number: b.number });
      return true;
    });
    if (done && paid) toRefund.push(b.id);
  }
  for (const id of toRefund) await refundBookingPayment(id, "acceptance_timeout");
  return stale.length;
}

/** Price + payment options for an offer before the customer commits. */
export async function quoteBooking(actor: Actor | null, input: { salonServiceId: string; addressId: string }) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  const address = await ownedAddress(a.id, input.addressId);
  const ev = await evaluateService(db, input.salonServiceId, address.districtId);
  if (!ev.eligible) throw new AppError("NOT_ELIGIBLE", ev.reason);
  const settings = await getSettings();
  const quote = computeQuote({
    items: [{ priceHalalas: ev.service.priceHalalas }],
    travelFeeHalalas: ev.travelFeeHalalas,
    vatBps: settings.vatBps,
    commissionBps: settings.commissionBps,
  });
  return { quote, service: ev.service, salon: ev.salon, address, paymentMethods: await salonPaymentMethodStatuses(ev.salon.id) };
}

const createSchema = z.object({
  salonServiceId: z.string().min(1),
  addressId: z.string().min(1),
  startsAt: z.coerce.date(),
  paymentMethod: z.enum(["CASH", "MADA", "CARD", "APPLE_PAY", "STC_PAY", "TABBY", "TAMARA"]),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});

/**
 * Creates a booking request. Every condition is re-checked at commit time (coverage, service,
 * schedule, payment method, price), and PostgreSQL's exclusion constraint guarantees that two
 * concurrent requests can never both reserve the same provider time.
 */
export async function createBooking(actor: Actor | null, input: Record<string, unknown>, now = new Date()) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  const d = parse(createSchema, input);
  const address = await ownedAddress(a.id, d.addressId);
  await expireStalePendingBookings(now);

  const ev = await evaluateService(db, d.salonServiceId, address.districtId);
  if (!ev.eligible) throw new AppError("NOT_ELIGIBLE", ev.reason);

  const method = (await salonPaymentMethodStatuses(ev.salon.id)).find((m) => m.method === d.paymentMethod)!;
  if (!isSelectable(method.state)) throw new AppError("PAYMENT_METHOD_UNAVAILABLE", method.state);

  // The requested start must be one of the computed free slots for at least one eligible provider.
  const date = riyadhDate(d.startsAt);
  const byStaff = await slotsByStaff(db, ev.salon, ev.staffIds, ev.service.durationMinutes, date, now);
  const candidates = ev.staffIds.filter((id) => byStaff.get(id)!.some((s) => s.getTime() === d.startsAt.getTime()));
  if (!candidates.length) throw new AppError("SLOT_UNAVAILABLE");

  const settings = await getSettings();
  const quote = computeQuote({
    items: [{ priceHalalas: ev.service.priceHalalas }],
    travelFeeHalalas: ev.travelFeeHalalas,
    vatBps: settings.vatBps,
    commissionBps: settings.commissionBps,
  });
  const startsAt = d.startsAt;
  const endsAt = new Date(startsAt.getTime() + ev.service.durationMinutes * 60_000);
  const blockedFrom = new Date(startsAt.getTime() - ev.salon.travelBufferMinutes * 60_000);
  // Online methods: the slot is held while the customer pays; the provider is asked only after payment.
  const online = isOnline(d.paymentMethod as PaymentMethod);
  const status: BookingStatus = online ? "PENDING_PAYMENT" : "PENDING_PROVIDER_ACCEPTANCE";
  const windowMinutes = online ? settings.paymentWindowMinutes : ev.salon.acceptanceTimeoutMinutes;
  const acceptBy = new Date(Math.min(now.getTime() + windowMinutes * 60_000, startsAt.getTime()));

  for (const staffMembershipId of candidates) {
    try {
      return await db.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            number: newNumber(),
            customerId: a.id,
            salonId: ev.salon.id,
            staffMembershipId,
            addressId: address.id,
            source: "MARKETPLACE",
            status,
            startsAt,
            endsAt,
            blockedFrom,
            acceptBy,
            addrCityAr: address.district.city.nameAr,
            addrCityEn: address.district.city.nameEn,
            addrDistrictAr: address.district.nameAr,
            addrDistrictEn: address.district.nameEn,
            addrDistrictId: address.districtId,
            addrStreet: address.street,
            addrBuilding: address.building,
            addrFloor: address.floor,
            addrInstructions: address.instructions,
            subtotalHalalas: quote.subtotalHalalas,
            travelFeeHalalas: quote.travelFeeHalalas,
            vatBps: quote.vatBps,
            vatHalalas: quote.vatHalalas,
            totalHalalas: quote.totalHalalas,
            commissionBps: quote.commissionBps,
            commissionHalalas: quote.commissionHalalas,
            cancellationWindowHours: ev.salon.cancellationWindowHours,
            paymentMethod: d.paymentMethod as PaymentMethod,
            notes: d.notes,
            items: {
              create: [
                {
                  salonServiceId: ev.service.id,
                  nameAr: ev.service.nameAr,
                  nameEn: ev.service.nameEn,
                  durationMinutes: ev.service.durationMinutes,
                  priceHalalas: ev.service.priceHalalas,
                },
              ],
            },
            payments: { create: { method: d.paymentMethod as PaymentMethod, amountHalalas: quote.totalHalalas } },
            history: { create: { from: null, to: status, actorId: a.id } },
          },
        });
        if (!online) {
          await notify(tx, await salonManagersAndStaff(tx, ev.salon.id, staffMembershipId), "booking.requested", {
            bookingId: booking.id,
            number: booking.number,
          });
        }
        return booking;
      });
    } catch (e) {
      if (isOverlapViolation(e)) continue; // this provider was taken concurrently; try the next one
      throw e;
    }
  }
  throw new AppError("SLOT_UNAVAILABLE");
}

/** Which capacities the actor holds on a booking (empty = no access). */
async function capacitiesFor(tx: Db, actor: Actor, b: Booking): Promise<Capacity[]> {
  const caps: Capacity[] = [];
  if (b.customerId === actor.id) caps.push("customer");
  const m = await tx.salonMembership.findUnique({ where: { salonId_userId: { salonId: b.salonId, userId: actor.id } } });
  if (m && m.status === "ACTIVE") {
    if (m.id === b.staffMembershipId) caps.push("provider");
    if (salonRoleHas(m.role, "salon.bookings.manage")) caps.push("salon");
  }
  if (hasPlatformPermission(actor, "platform.bookings.manage")) caps.push("platform");
  return caps;
}

async function canRead(tx: Db, actor: Actor, b: Booking) {
  if ((await capacitiesFor(tx, actor, b)).length) return true;
  if (hasPlatformPermission(actor, "platform.bookings.read")) return true;
  const m = await tx.salonMembership.findUnique({ where: { salonId_userId: { salonId: b.salonId, userId: actor.id } } });
  return !!m && m.status === "ACTIVE" && salonRoleHas(m.role, "salon.bookings.read");
}

/** Booking as seen by the actor; the street address is withheld from the salon side until confirmation. */
export async function getBooking(actor: Actor | null, bookingId: string) {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: true,
      payments: { include: { refunds: true } },
      history: { orderBy: { createdAt: "asc" } },
      review: true,
      salon: { select: { id: true, name: true } },
      staff: { include: { user: { select: { name: true } } } },
      customer: { select: { name: true, phone: true } },
    },
  });
  if (!b || !(await canRead(db, actor, b))) throw new AppError("NOT_FOUND");
  const caps = await capacitiesFor(db, actor, b);
  const fullAddress =
    caps.includes("customer") ||
    hasPlatformPermission(actor, "platform.bookings.read") ||
    ADDRESS_VISIBLE_TO_PROVIDER.includes(b.status);
  const customerContact = caps.includes("customer") || hasPlatformPermission(actor, "platform.bookings.read") || ADDRESS_VISIBLE_TO_PROVIDER.includes(b.status);
  return {
    ...b,
    addrStreet: fullAddress ? b.addrStreet : null,
    addrBuilding: fullAddress ? b.addrBuilding : null,
    addrFloor: fullAddress ? b.addrFloor : null,
    addrInstructions: fullAddress ? b.addrInstructions : null,
    customer: { name: b.customer.name, phone: customerContact ? b.customer.phone : null },
    capacities: caps,
    nextActions: allowedNext(b.status, caps).map((r) => ({ to: r.to, reasonRequired: !!r.reasonRequired })),
    canReview: caps.includes("customer") && b.status === "COMPLETED" && !b.review,
    canPay: caps.includes("customer") && b.status === "PENDING_PAYMENT",
    canRecordCash:
      (caps.includes("provider") || caps.includes("salon")) &&
      b.paymentMethod === "CASH" &&
      b.paymentStatus === "PENDING" &&
      (b.status === "IN_PROGRESS" || b.status === "COMPLETED"),
  };
}

export async function transitionBooking(actor: Actor | null, bookingId: string, to: BookingStatus, reason?: string, now = new Date()) {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  const why = reason?.trim() || null;
  const result = await db.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!b || !(await canRead(tx, actor, b))) throw new AppError("NOT_FOUND");
    const caps = await capacitiesFor(tx, actor, b);
    const rule = findRule(b.status, to, caps);
    if (!rule) throw new AppError("INVALID_TRANSITION", `${b.status}→${to}`);
    if (rule.reasonRequired && (!why || why.length < 3)) throw new AppError("VALIDATION", "reason required");

    const actingAs: Capacity = rule.by.find((c) => caps.includes(c))!;
    if (to === "CANCELLED" && actingAs === "customer" && b.status === "CONFIRMED") {
      const hoursLeft = (b.startsAt.getTime() - now.getTime()) / 3_600_000;
      if (hoursLeft < b.cancellationWindowHours) throw new AppError("LATE_CANCELLATION");
    }

    const voidPayment = (to === "CANCELLED" || to === "REJECTED") && b.paymentStatus === "PENDING";
    const r = await tx.booking.updateMany({
      where: { id: b.id, status: b.status }, // optimistic lock: a concurrent change wins, this one fails
      data: {
        status: to,
        cancelReason: ["CANCELLED", "REJECTED", "NO_SHOW"].includes(to) ? why : undefined,
        paymentStatus: voidPayment ? "VOIDED" : undefined,
      },
    });
    if (r.count === 0) throw new AppError("CONFLICT");
    if (voidPayment) await tx.payment.updateMany({ where: { bookingId: b.id, status: "PENDING" }, data: { status: "VOIDED" } });
    await tx.bookingStatusHistory.create({ data: { bookingId: b.id, from: b.status, to, actorId: actor.id, reason: why } });

    const recipients =
      actingAs === "customer" ? await salonManagersAndStaff(tx, b.salonId, b.staffMembershipId) : [b.customerId];
    await notify(tx, recipients, `booking.${to.toLowerCase()}`, { bookingId: b.id, number: b.number });
    if (actingAs === "salon" || actingAs === "platform") {
      await audit(tx, {
        actorId: actor.id,
        action: "booking.status_changed",
        targetType: "Booking",
        targetId: b.id,
        salonId: b.salonId,
        reason: why,
        metadata: { from: b.status, to, as: actingAs },
      });
    }
    logger.info("booking.transition", { bookingId: b.id, from: b.status, to, as: actingAs });
    const paidOnline = (b.paymentStatus === "PAID" || b.paymentStatus === "AUTHORIZED") && isOnline(b.paymentMethod);
    return { from: b.status, to, refund: paidOnline && (to === "CANCELLED" || to === "REJECTED") };
  });
  // Money is returned after the status change has committed (never inside the DB transaction).
  if (result.refund) await refundBookingPayment(bookingId, `booking_${to.toLowerCase()}`);
  return { from: result.from, to: result.to };
}

/** Provider/salon confirms that the customer paid cash for a booking being or already served. */
export async function recordCashPayment(actor: Actor | null, bookingId: string) {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  return db.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!b || !(await canRead(tx, actor, b))) throw new AppError("NOT_FOUND");
    const caps = await capacitiesFor(tx, actor, b);
    if (!caps.includes("provider") && !caps.includes("salon")) throw new AppError("FORBIDDEN");
    if (b.paymentMethod !== "CASH" || !["IN_PROGRESS", "COMPLETED"].includes(b.status)) throw new AppError("INVALID_TRANSITION");
    const p = await tx.payment.updateMany({
      where: { bookingId: b.id, method: "CASH", status: "PENDING" },
      data: { status: "PAID", recordedById: actor.id },
    });
    if (p.count === 0) throw new AppError("CONFLICT");
    await tx.booking.update({ where: { id: b.id }, data: { paymentStatus: "PAID" } });
    await audit(tx, {
      actorId: actor.id,
      action: "payment.cash_recorded",
      targetType: "Booking",
      targetId: b.id,
      salonId: b.salonId,
      metadata: { amountHalalas: b.totalHalalas },
    });
  });
}

export async function listMyBookings(actor: Actor | null) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  await expireStalePendingBookings();
  return db.booking.findMany({
    where: { customerId: a.id },
    include: { salon: { select: { name: true } }, items: true },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
}

/** Salon bookings: owners/managers see all; staff see only their own. */
export async function listSalonBookings(actor: Actor | null, salonId: string) {
  const access = await requireSalonPermission(db, actor, salonId, "salon.profile.read");
  await expireStalePendingBookings();
  const seesAll = access.role === null || salonRoleHas(access.role, "salon.bookings.read");
  return db.booking.findMany({
    where: { salonId, ...(seesAll ? {} : { staffMembershipId: access.membership!.id }) },
    include: { items: true, staff: { include: { user: { select: { name: true, phone: true } } } } },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
}

export { isAppError };
