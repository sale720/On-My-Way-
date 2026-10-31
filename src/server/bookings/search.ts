import { db, type Db } from "../db";
import { AppError } from "../errors";
import { requirePlatformPermission, type Actor } from "../rbac/authorize";
import { ownedAddress } from "../geo/service";
import { computeSlots } from "../availability/slots";
import { loadProviderCalendars } from "../availability/service";
import { computeQuote, type Quote } from "../pricing/quote";
import { getSettings } from "../settings/service";
import { addDays, isDateStr, riyadhDate } from "../time";

/**
 * Coverage & eligibility (Phase 2 = district-based). A salon service is offered at an address only if:
 *   1. the salon is ACTIVE                               → else SALON_NOT_ACTIVE
 *   2. the service is active                             → else SERVICE_INACTIVE
 *   3. the address district is in the salon's active area → else OUT_OF_SALON_AREA
 *   4. some active staff member can perform the service  → else NO_STAFF_FOR_SERVICE
 *   5. …and that member covers the district herself      → else NO_STAFF_COVERS_AREA
 *   6. …and has working hours                            → else NO_STAFF_SCHEDULE
 *   7. …and has a free slot in the booking horizon       → else NO_AVAILABILITY
 * Salon area AND provider area must both match (reference §4.1).
 */
export type IneligibleReason =
  | "SALON_NOT_ACTIVE"
  | "SERVICE_INACTIVE"
  | "OUT_OF_SALON_AREA"
  | "NO_STAFF_FOR_SERVICE"
  | "NO_STAFF_COVERS_AREA"
  | "NO_STAFF_SCHEDULE"
  | "NO_AVAILABILITY";

export async function evaluateService(tx: Db, salonServiceId: string, districtId: string) {
  const service = await tx.salonService.findUnique({ where: { id: salonServiceId }, include: { salon: true } });
  if (!service) throw new AppError("NOT_FOUND");
  const base = { service, salon: service.salon, travelFeeHalalas: 0, staffIds: [] as string[] };
  if (service.salon.status !== "ACTIVE") return { ...base, eligible: false as const, reason: "SALON_NOT_ACTIVE" as IneligibleReason };
  if (!service.active) return { ...base, eligible: false as const, reason: "SERVICE_INACTIVE" as IneligibleReason };

  const area = await tx.salonCoverageArea.findUnique({ where: { salonId_districtId: { salonId: service.salonId, districtId } } });
  if (!area || !area.active) return { ...base, eligible: false as const, reason: "OUT_OF_SALON_AREA" as IneligibleReason };

  const skilled = await tx.salonMembership.findMany({
    where: { salonId: service.salonId, status: "ACTIVE", skills: { some: { salonServiceId } } },
    include: { coverage: { where: { districtId } }, _count: { select: { availability: true } } },
  });
  if (!skilled.length) return { ...base, travelFeeHalalas: area.travelFeeHalalas, eligible: false as const, reason: "NO_STAFF_FOR_SERVICE" as IneligibleReason };
  const covering = skilled.filter((m) => m.coverage.length > 0);
  if (!covering.length) return { ...base, travelFeeHalalas: area.travelFeeHalalas, eligible: false as const, reason: "NO_STAFF_COVERS_AREA" as IneligibleReason };
  const scheduled = covering.filter((m) => m._count.availability > 0);
  if (!scheduled.length) return { ...base, travelFeeHalalas: area.travelFeeHalalas, eligible: false as const, reason: "NO_STAFF_SCHEDULE" as IneligibleReason };

  return { ...base, travelFeeHalalas: area.travelFeeHalalas, eligible: true as const, reason: null, staffIds: scheduled.map((m) => m.id) };
}

/** Free start times for a service on a date, per eligible provider. */
export async function slotsByStaff(
  tx: Db,
  salon: { travelBufferMinutes: number; minNoticeMinutes: number; maxAdvanceDays: number },
  staffIds: string[],
  durationMinutes: number,
  date: string,
  now = new Date(),
) {
  const cals = await loadProviderCalendars(tx, staffIds, date);
  return new Map(
    staffIds.map((id) => {
      const c = cals.get(id)!;
      return [
        id,
        computeSlots({
          date,
          rules: c.rules,
          exceptionDates: c.exceptionDates,
          busy: c.busy,
          durationMinutes,
          travelBufferMinutes: salon.travelBufferMinutes,
          minNoticeMinutes: salon.minNoticeMinutes,
          maxAdvanceDays: salon.maxAdvanceDays,
          now,
        }),
      ];
    }),
  );
}

const SEARCH_HORIZON_DAYS = 14;

async function earliestSlot(tx: Db, ev: Awaited<ReturnType<typeof evaluateService>>, now: Date): Promise<Date | null> {
  const today = riyadhDate(now);
  const horizon = Math.min(SEARCH_HORIZON_DAYS, ev.salon.maxAdvanceDays);
  for (let d = 0; d <= horizon; d++) {
    const map = await slotsByStaff(tx, ev.salon, ev.staffIds, ev.service.durationMinutes, addDays(today, d), now);
    const all = [...map.values()].flat().sort((a, b) => a.getTime() - b.getTime());
    if (all.length) return all[0];
  }
  return null;
}

export interface Offer {
  salonServiceId: string;
  salonId: string;
  salonName: string;
  serviceNameAr: string;
  serviceNameEn: string;
  durationMinutes: number;
  quote: Quote;
  earliest: Date;
  rating: { avg: number | null; count: number };
}

/** Marketplace search: only options that passed coverage and availability checks are returned as bookable. */
export async function findOffers(actor: Actor | null, input: { addressId: string; categoryId: string }, now = new Date()) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  const address = await ownedAddress(a.id, input.addressId);
  const settings = await getSettings();
  const candidates = await db.salonService.findMany({
    where: { categoryId: input.categoryId, active: true, salon: { status: "ACTIVE" } },
    select: { id: true },
  });

  const offers: Offer[] = [];
  const excluded: { salonServiceId: string; reason: IneligibleReason }[] = [];
  for (const c of candidates) {
    const ev = await evaluateService(db, c.id, address.districtId);
    if (!ev.eligible) {
      excluded.push({ salonServiceId: c.id, reason: ev.reason });
      continue;
    }
    const earliest = await earliestSlot(db, ev, now);
    if (!earliest) {
      excluded.push({ salonServiceId: c.id, reason: "NO_AVAILABILITY" });
      continue;
    }
    const agg = await db.review.aggregate({ where: { salonId: ev.salon.id }, _avg: { rating: true }, _count: true });
    offers.push({
      salonServiceId: ev.service.id,
      salonId: ev.salon.id,
      salonName: ev.salon.name,
      serviceNameAr: ev.service.nameAr,
      serviceNameEn: ev.service.nameEn,
      durationMinutes: ev.service.durationMinutes,
      quote: computeQuote({
        items: [{ priceHalalas: ev.service.priceHalalas }],
        travelFeeHalalas: ev.travelFeeHalalas,
        vatBps: settings.vatBps,
        commissionBps: settings.commissionBps,
      }),
      earliest,
      rating: { avg: agg._avg.rating, count: agg._count },
    });
  }
  // Ranking: real availability first, then price. No paid placement exists.
  offers.sort((x, y) => x.earliest.getTime() - y.earliest.getTime() || x.quote.totalHalalas - y.quote.totalHalalas);
  return { address, offers, excluded };
}

/** Bookable start times for one offer on one date (union across eligible providers). */
export async function getOfferSlots(actor: Actor | null, input: { salonServiceId: string; addressId: string; date: string }, now = new Date()) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  if (!isDateStr(input.date)) throw new AppError("VALIDATION", "date");
  const address = await ownedAddress(a.id, input.addressId);
  const ev = await evaluateService(db, input.salonServiceId, address.districtId);
  if (!ev.eligible) return { eligible: false as const, reason: ev.reason, slots: [] as Date[], ev };
  const map = await slotsByStaff(db, ev.salon, ev.staffIds, ev.service.durationMinutes, input.date, now);
  const unique = new Map<number, Date>();
  for (const list of map.values()) for (const s of list) unique.set(s.getTime(), s);
  return { eligible: true as const, reason: null, slots: [...unique.values()].sort((x, y) => x.getTime() - y.getTime()), ev };
}
