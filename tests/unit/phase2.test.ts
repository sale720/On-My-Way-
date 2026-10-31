import { describe, expect, it } from "vitest";
import { computeSlots } from "@/server/availability/slots";
import { computeQuote } from "@/server/pricing/quote";
import { allowedNext, findRule, TRANSITIONS } from "@/server/bookings/state";
import { PAYMENT_METHODS } from "@/server/payments/methods";
import { addDays, hhmmToMinutes, riyadhDate, riyadhToUtc, weekdayOf } from "@/server/time";

describe("Riyadh time helpers (UTC+3, no DST)", () => {
  it("converts local wall time to UTC", () => {
    expect(riyadhToUtc("2026-11-01", 9 * 60).toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(riyadhToUtc("2026-11-01", 1 * 60).toISOString()).toBe("2026-10-31T22:00:00.000Z");
  });
  it("computes the local date across midnight", () => {
    expect(riyadhDate(new Date("2026-10-31T21:30:00Z"))).toBe("2026-11-01");
    expect(riyadhDate(new Date("2026-10-31T20:59:00Z"))).toBe("2026-10-31");
  });
  it("weekday and date arithmetic", () => {
    expect(weekdayOf("2026-11-01")).toBe(0); // Sunday
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(hhmmToMinutes("08:30")).toBe(510);
    expect(Number.isNaN(hhmmToMinutes("25:00"))).toBe(true);
  });
});

describe("slot engine", () => {
  const base = {
    date: "2026-11-02", // Monday
    rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
    exceptionDates: [],
    busy: [],
    durationMinutes: 60,
    travelBufferMinutes: 30,
    minNoticeMinutes: 0,
    maxAdvanceDays: 30,
    now: new Date("2026-11-01T00:00:00Z"),
  };
  const local = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(11, 16);

  it("keeps travel and service inside the working window", () => {
    const s = computeSlots(base).map(local);
    expect(s[0]).toBe("09:30"); // 30 min travel from 09:00
    expect(s.at(-1)).toBe("11:00"); // ends exactly at 12:00
    expect(s).toHaveLength(7); // 09:30 … 11:00 every 15 min
  });

  it("never offers a slot whose travel or service overlaps an existing reservation", () => {
    // A 10:00–11:00 reservation blocks every start in this 3-hour window: any [S−30, S+60) intersects it.
    const mid = [{ from: riyadhToUtc(base.date, 10 * 60), to: riyadhToUtc(base.date, 11 * 60) }];
    expect(computeSlots({ ...base, busy: mid })).toEqual([]);
    // A 09:00–09:30 reservation: the next start needs its travel to begin at 09:30 → first slot 10:00.
    const early = [{ from: riyadhToUtc(base.date, 9 * 60), to: riyadhToUtc(base.date, 9 * 60 + 30) }];
    expect(computeSlots({ ...base, busy: early }).map(local)).toEqual(["10:00", "10:15", "10:30", "10:45", "11:00"]);
  });

  it("respects minimum notice, booking horizon, exceptions and other weekdays", () => {
    const now = riyadhToUtc(base.date, 10 * 60);
    expect(computeSlots({ ...base, now, minNoticeMinutes: 60 }).map(local)[0]).toBe("11:00");
    expect(computeSlots({ ...base, maxAdvanceDays: 0 })).toEqual([]);
    expect(computeSlots({ ...base, exceptionDates: [base.date] })).toEqual([]);
    expect(computeSlots({ ...base, date: "2026-11-03" })).toEqual([]); // Tuesday: no rule
    expect(computeSlots({ ...base, now: new Date("2026-11-05T00:00:00Z") })).toEqual([]); // date in the past
  });
});

describe("pricing engine", () => {
  it("computes subtotal, travel, VAT, total and commission in halalas", () => {
    const q = computeQuote({ items: [{ priceHalalas: 15000 }], travelFeeHalalas: 2500, vatBps: 1500, commissionBps: 1000 });
    expect(q).toEqual({
      subtotalHalalas: 15000,
      travelFeeHalalas: 2500,
      vatBps: 1500,
      vatHalalas: 2625, // 15% of 175.00
      totalHalalas: 20125,
      commissionBps: 1000,
      commissionHalalas: 1500, // 10% of the service value only
      providerNetHalalas: 16000,
    });
  });
  it("rounds half-up once per component and rejects invalid inputs", () => {
    expect(computeQuote({ items: [{ priceHalalas: 333 }], travelFeeHalalas: 0, vatBps: 1500, commissionBps: 0 }).vatHalalas).toBe(50);
    expect(() => computeQuote({ items: [{ priceHalalas: -1 }], travelFeeHalalas: 0, vatBps: 0, commissionBps: 0 })).toThrow();
    expect(() => computeQuote({ items: [{ priceHalalas: 1.5 }], travelFeeHalalas: 0, vatBps: 0, commissionBps: 0 })).toThrow();
  });
  it("defaults of zero mean no VAT and no commission", () => {
    const q = computeQuote({ items: [{ priceHalalas: 10000 }], travelFeeHalalas: 0, vatBps: 0, commissionBps: 0 });
    expect(q.totalHalalas).toBe(10000);
    expect(q.commissionHalalas).toBe(0);
  });
});

describe("booking state machine", () => {
  it("the customer cannot confirm her own request; the provider can", () => {
    expect(findRule("PENDING_PROVIDER_ACCEPTANCE", "CONFIRMED", ["customer"])).toBeNull();
    expect(findRule("PENDING_PROVIDER_ACCEPTANCE", "CONFIRMED", ["provider"])).not.toBeNull();
  });
  it("forbids skipping steps and leaving terminal states", () => {
    expect(findRule("CONFIRMED", "COMPLETED", ["provider", "salon", "platform"])).toBeNull();
    for (const t of ["CANCELLED", "REJECTED", "NO_SHOW", "REFUNDED"] as const) {
      expect(TRANSITIONS[t] ?? []).toEqual([]);
    }
  });
  it("rejections and late-stage cancellations require a reason", () => {
    expect(findRule("PENDING_PROVIDER_ACCEPTANCE", "REJECTED", ["provider"])?.reasonRequired).toBe(true);
    expect(findRule("CONFIRMED", "CANCELLED", ["customer"])?.reasonRequired).toBe(true);
  });
  it("the provider's next actions follow the visit sequence", () => {
    expect(allowedNext("CONFIRMED", ["provider"]).map((r) => r.to)).toEqual(["PROVIDER_EN_ROUTE"]);
    expect(allowedNext("PROVIDER_ARRIVED", ["provider"]).map((r) => r.to)).toEqual(["IN_PROGRESS", "NO_SHOW"]);
  });
});

describe("payment method registry", () => {
  it("lists every method; only cash is integrated today", () => {
    expect(PAYMENT_METHODS.map((p) => p.method)).toEqual(["CASH", "MADA", "CARD", "APPLE_PAY", "STC_PAY", "TABBY", "TAMARA"]);
    expect(PAYMENT_METHODS.filter((p) => p.integrated).map((p) => p.method)).toEqual(["CASH"]);
  });
});
