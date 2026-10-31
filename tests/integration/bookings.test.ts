import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createAddress, setStaffCoverage, upsertSalonCoverage } from "@/server/geo/service";
import { evaluateService, findOffers } from "@/server/bookings/search";
import {
  createBooking,
  expireStalePendingBookings,
  getBooking,
  listMyBookings,
  listSalonBookings,
  quoteBooking,
  recordCashPayment,
  transitionBooking,
} from "@/server/bookings/service";
import { setStaffSkills, updateSalonService } from "@/server/catalog/service";
import { setSetting } from "@/server/settings/service";
import { setSalonStatus, addMember, createSalon } from "@/server/salons/service";
import { createReview } from "@/server/reviews/service";
import { platformReport } from "@/server/reports/service";
import { addException } from "@/server/availability/service";
import { listMyNotifications } from "@/server/notifications/service";
import { addDays, riyadhDate } from "@/server/time";
import { resetTestDb, signIn } from "../helpers";
import { bookingRow, firstSlot, marketplace } from "../fixtures";

beforeEach(resetTestDb);

const book = (m: Awaited<ReturnType<typeof marketplace>>, startsAt: Date, extra: Record<string, unknown> = {}) =>
  createBooking(m.customer.actor, { salonServiceId: m.service.id, addressId: m.address.id, startsAt, paymentMethod: "CASH", ...extra });

describe("search & coverage eligibility", () => {
  it("returns the eligible offer with an exact price breakdown (service + travel fee + configured VAT)", async () => {
    const m = await marketplace();
    await setSetting(m.admin.actor, "vatBps", 1500, "VAT registration effective");
    await setSetting(m.admin.actor, "commissionBps", 1000, "launch commission");
    const { offers } = await findOffers(m.customer.actor, { addressId: m.address.id, categoryId: m.category.id });
    expect(offers).toHaveLength(1);
    expect(offers[0].quote).toMatchObject({
      subtotalHalalas: 15000,
      travelFeeHalalas: 2500,
      vatHalalas: 2625,
      totalHalalas: 20125,
      commissionHalalas: 1500,
    });
    expect(offers[0].earliest.getTime()).toBeGreaterThan(Date.now());
  });

  it("explains why an option is not offered", async () => {
    const m = await marketplace();
    // Address outside the salon's area
    const far = await findOffers(m.customer.actor, { addressId: m.farAddress.id, categoryId: m.category.id });
    expect(far.offers).toHaveLength(0);
    expect(far.excluded).toEqual([{ salonServiceId: m.service.id, reason: "OUT_OF_SALON_AREA" }]);

    // Salon covers the district, but the provider does not (two-level coverage)
    await upsertSalonCoverage(m.owner.actor, m.salon.id, { districtId: m.outArea.id, travelFeeSar: "40" });
    expect((await evaluateService(db, m.service.id, m.outArea.id)).reason).toBe("NO_STAFF_COVERS_AREA");

    // Nobody can perform the service
    await setStaffSkills(m.provider.actor, m.salon.id, m.membership.id, []);
    expect((await evaluateService(db, m.service.id, m.inArea.id)).reason).toBe("NO_STAFF_FOR_SERVICE");

    // Salon not approved
    await setSalonStatus(m.admin.actor, m.salon.id, "SUSPENDED", "test suspension");
    expect((await evaluateService(db, m.service.id, m.inArea.id)).reason).toBe("SALON_NOT_ACTIVE");
  });

  it("a customer cannot search with someone else's address", async () => {
    const m = await marketplace();
    const other = await signIn();
    await expect(findOffers(other.actor, { addressId: m.address.id, categoryId: m.category.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("booking creation", () => {
  it("persists a pending request with price, address and policy snapshots, a cash payment row and history", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot, { notes: "الباب الجانبي" });
    const row = await bookingRow(b.id);
    expect(row).toMatchObject({
      status: "PENDING_PROVIDER_ACCEPTANCE",
      staffMembershipId: m.membership.id,
      subtotalHalalas: 15000,
      travelFeeHalalas: 2500,
      totalHalalas: 17500,
      addrDistrictAr: "الملقا",
      addrStreet: "شارع الاختبار 1",
      cancellationWindowHours: 24,
      paymentMethod: "CASH",
      paymentStatus: "PENDING",
    });
    expect(row.blockedFrom.getTime()).toBe(slot.getTime() - 30 * 60_000);
    expect(row.items[0]).toMatchObject({ nameAr: "قص شعر", priceHalalas: 15000, durationMinutes: 60 });
    expect(row.payments).toHaveLength(1);
    expect(row.history.map((h) => h.to)).toEqual(["PENDING_PROVIDER_ACCEPTANCE"]);
    expect(row.number).toMatch(/^OMW-[2-9A-Z]{6}$/);
    // The salon side is notified in-app
    expect((await listMyNotifications(m.provider.actor))[0]).toMatchObject({ type: "booking.requested" });
  });

  it("re-validates at commit time: arbitrary time, out-of-area address, unavailable payment method", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    await expect(book(m, new Date(slot.getTime() + 7 * 60_000))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await expect(book(m, slot, { addressId: m.farAddress.id })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(book(m, slot, { paymentMethod: "MADA" })).rejects.toMatchObject({ code: "PAYMENT_METHOD_UNAVAILABLE" });
    expect(await db.booking.count()).toBe(0);
  });

  it("two customers racing for the same provider and time: exactly one wins", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const rival = await signIn();
    const rivalAddr = await createAddress(rival.actor, { districtId: m.inArea.id, street: "شارع المنافس 2" });
    const results = await Promise.allSettled([
      book(m, slot),
      createBooking(rival.actor, { salonServiceId: m.service.id, addressId: rivalAddr.id, startsAt: slot, paymentMethod: "CASH" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "SLOT_UNAVAILABLE" });
    expect(await db.booking.count()).toBe(1);
  });

  it("PostgreSQL itself rejects an overlapping reservation even if application checks are bypassed", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot);
    const row = await bookingRow(b.id);
    const copy = Object.fromEntries(
      Object.entries(row).filter(([k]) => !["id", "number", "createdAt", "updatedAt", "payments", "history", "items"].includes(k)),
    ) as Omit<typeof row, "id" | "number" | "createdAt" | "updatedAt" | "payments" | "history" | "items">;
    await expect(
      db.booking.create({ data: { ...copy, number: "OMW-DUPLX1", startsAt: new Date(slot.getTime() + 15 * 60_000), endsAt: new Date(slot.getTime() + 75 * 60_000), blockedFrom: new Date(slot.getTime() - 15 * 60_000) } }),
    ).rejects.toThrow(/booking_no_overlap_per_provider|23P01|exclusion/i);
  });

  it("a slot taken by a pending request disappears from availability; the next provider is used when available", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    await book(m, slot);
    expect((await firstSlot(m)).some((s) => s.getTime() === slot.getTime())).toBe(false);

    // Add a second qualified provider: the same time becomes bookable again (assigned to her).
    const p2 = await signIn();
    const m2 = await addMember(m.owner.actor, m.salon.id, { phone: p2.phone, role: "STAFF" });
    await setStaffSkills(m.owner.actor, m.salon.id, m2.id, [m.service.id]);
    await setStaffCoverage(m.owner.actor, m.salon.id, m2.id, [m.inArea.id]);
    await db.availabilityRule.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ membershipId: m2.id, weekday, startMinute: 480, endMinute: 1320 })) });
    const other = await signIn();
    const addr = await createAddress(other.actor, { districtId: m.inArea.id, street: "شارع ثالث 3" });
    const b2 = await createBooking(other.actor, { salonServiceId: m.service.id, addressId: addr.id, startsAt: slot, paymentMethod: "CASH" });
    expect(b2.staffMembershipId).toBe(m2.id);
  });

  it("a provider's day off removes her slots", async () => {
    const m = await marketplace();
    const date = addDays(riyadhDate(new Date()), 1);
    await addException(m.provider.actor, m.salon.id, m.membership.id, date, "إجازة");
    await expect(firstSlot(m)).rejects.toThrow("no slots");
  });
});

describe("booking lifecycle, permissions and privacy", () => {
  it("full visit: accept → en route → arrived → in progress → completed → cash recorded → review", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot);

    // Before confirmation the provider sees the district but not the street address or phone.
    const early = await getBooking(m.provider.actor, b.id);
    expect(early.addrDistrictAr).toBe("الملقا");
    expect(early.addrStreet).toBeNull();
    expect(early.customer.phone).toBeNull();

    // The customer cannot confirm her own booking.
    await expect(transitionBooking(m.customer.actor, b.id, "CONFIRMED")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    // Steps cannot be skipped.
    await expect(transitionBooking(m.provider.actor, b.id, "COMPLETED")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    for (const to of ["CONFIRMED", "PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) {
      await transitionBooking(m.provider.actor, b.id, to);
    }
    const after = await getBooking(m.provider.actor, b.id);
    expect(after.addrStreet).toBe("شارع الاختبار 1");
    expect(after.customer.phone).toBe(m.customer.phone);
    expect(after.canRecordCash).toBe(true);

    await recordCashPayment(m.provider.actor, b.id);
    await expect(recordCashPayment(m.provider.actor, b.id)).rejects.toMatchObject({ code: "CONFLICT" }); // idempotent: no double record
    const row = await bookingRow(b.id);
    expect(row.status).toBe("COMPLETED");
    expect(row.paymentStatus).toBe("PAID");
    expect(row.payments[0]).toMatchObject({ status: "PAID", recordedById: m.provider.userId });
    expect(row.history.map((h) => h.to)).toEqual([
      "PENDING_PROVIDER_ACCEPTANCE",
      "CONFIRMED",
      "PROVIDER_EN_ROUTE",
      "PROVIDER_ARRIVED",
      "IN_PROGRESS",
      "COMPLETED",
    ]);

    await createReview(m.customer.actor, b.id, { rating: 5, quality: 5, comment: "ممتازة" });
    await expect(createReview(m.customer.actor, b.id, { rating: 1 })).rejects.toMatchObject({ code: "ALREADY_REVIEWED" });
    const report = await platformReport(m.admin.actor);
    expect(report.completedGmvHalalas).toBe(17500);
    expect(report.cashCollectedHalalas).toBe(17500);
    expect(report.completionRate).toBe(1);
  });

  it("reviews are only for the booking's customer and only after completion", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot);
    await expect(createReview(m.customer.actor, b.id, { rating: 5 })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const stranger = await signIn();
    await expect(createReview(stranger.actor, b.id, { rating: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejection requires a reason, frees the slot and voids the pending payment", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot);
    await expect(transitionBooking(m.provider.actor, b.id, "REJECTED")).rejects.toMatchObject({ code: "VALIDATION" });
    await transitionBooking(m.provider.actor, b.id, "REJECTED", "خارج أوقاتي ذلك اليوم");
    const row = await bookingRow(b.id);
    expect(row).toMatchObject({ status: "REJECTED", paymentStatus: "VOIDED", cancelReason: "خارج أوقاتي ذلك اليوم" });
    expect((await firstSlot(m)).some((s) => s.getTime() === slot.getTime())).toBe(true);
  });

  it("customer cancellation follows the salon's free-cancellation window", async () => {
    const m = await marketplace();
    const slots = await firstSlot(m);
    const b1 = await book(m, slots[0]);
    await transitionBooking(m.provider.actor, b1.id, "CONFIRMED");
    const oneHourBefore = new Date(slots[0].getTime() - 3600_000);
    await expect(transitionBooking(m.customer.actor, b1.id, "CANCELLED", "ظرف طارئ", oneHourBefore)).rejects.toMatchObject({
      code: "LATE_CANCELLATION",
    });
    const twoDaysBefore = new Date(slots[0].getTime() - 48 * 3600_000);
    await transitionBooking(m.customer.actor, b1.id, "CANCELLED", "تغيّر الموعد", twoDaysBefore);
    expect((await bookingRow(b1.id)).status).toBe("CANCELLED");
  });

  it("unanswered requests expire automatically and the customer is told", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot);
    expect(await expireStalePendingBookings(new Date(Date.now() + 2 * 3600_000))).toBe(1);
    const row = await bookingRow(b.id);
    expect(row).toMatchObject({ status: "CANCELLED", cancelReason: "acceptance_timeout", paymentStatus: "VOIDED" });
    expect(row.history.at(-1)).toMatchObject({ actorId: null, reason: "acceptance_timeout" });
    expect((await listMyNotifications(m.customer.actor))[0].type).toBe("booking.expired");
  });

  it("price changes and coverage changes never alter or cancel an existing booking", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot);
    await transitionBooking(m.provider.actor, b.id, "CONFIRMED");
    await updateSalonService(m.owner.actor, m.salon.id, m.service.id, { priceSar: "999" });
    await upsertSalonCoverage(m.owner.actor, m.salon.id, { districtId: m.inArea.id, travelFeeSar: "25", active: false });
    const row = await bookingRow(b.id);
    expect(row.status).toBe("CONFIRMED");
    expect(row.totalHalalas).toBe(17500);
    // …but new requests in the removed district are refused.
    await expect(quoteBooking(m.customer.actor, { salonServiceId: m.service.id, addressId: m.address.id })).rejects.toMatchObject({
      code: "NOT_ELIGIBLE",
    });
  });

  it("booking data is isolated: other customers, other salons and staff see only what they may", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot);

    const stranger = await signIn();
    await expect(getBooking(stranger.actor, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(transitionBooking(stranger.actor, b.id, "CANCELLED")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const otherOwner = await signIn();
    const otherSalon = await createSalon(otherOwner.actor, { name: "Other" });
    await expect(getBooking(otherOwner.actor, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listSalonBookings(otherOwner.actor, m.salon.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listSalonBookings(otherOwner.actor, otherSalon.id)).toHaveLength(0);

    // A second staff member of the same salon does not see a colleague's booking list entries.
    const colleague = await signIn();
    await addMember(m.owner.actor, m.salon.id, { phone: colleague.phone, role: "STAFF" });
    expect(await listSalonBookings(colleague.actor, m.salon.id)).toHaveLength(0);
    await expect(getBooking(colleague.actor, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Owner sees all; the customer sees hers.
    expect(await listSalonBookings(m.owner.actor, m.salon.id)).toHaveLength(1);
    expect(await listMyBookings(m.customer.actor)).toHaveLength(1);

    // Support can read for case handling but cannot change the booking.
    const support = await signIn(undefined, ["SUPPORT_AGENT"]);
    await expect(getBooking(support.actor, b.id)).resolves.toBeTruthy();
    await expect(transitionBooking(support.actor, b.id, "CANCELLED", "x y z")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("a provider whose membership is disabled can no longer act on her bookings", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const b = await book(m, slot);
    await db.salonMembership.update({ where: { id: m.membership.id }, data: { status: "DISABLED" } });
    await expect(transitionBooking(m.provider.actor, b.id, "CONFIRMED")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
