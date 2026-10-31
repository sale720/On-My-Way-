import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createCategory, createSalonService, setStaffSkills } from "@/server/catalog/service";
import { createCity, createDistrict, setStaffCoverage, upsertSalonCoverage } from "@/server/geo/service";
import { setWeeklyRules } from "@/server/availability/service";
import { getSettings, setSetting } from "@/server/settings/service";
import {
  listPlatformPaymentMethods,
  listSalonPaymentMethods,
  setPlatformPaymentMethod,
  setSalonPaymentMethod,
} from "@/server/payments/service";
import { createBooking } from "@/server/bookings/service";
import { updateSalonPolicy } from "@/server/salons/service";
import { addMember } from "@/server/salons/service";
import { resetEnvCache } from "@/server/env";
import { resetTestDb, signIn } from "../helpers";

/** Run a block with PAYMENT_MODE overridden, restoring it afterwards. */
async function withPaymentMode<T>(mode: "off" | "sandbox", fn: () => Promise<T>) {
  const prev = process.env.PAYMENT_MODE;
  process.env.PAYMENT_MODE = mode;
  resetEnvCache();
  try {
    return await fn();
  } finally {
    process.env.PAYMENT_MODE = prev;
    resetEnvCache();
  }
}
import { firstSlot, marketplace } from "../fixtures";

beforeEach(resetTestDb);

describe("catalog, geography and settings permissions", () => {
  it("only platform admins manage categories, geography and commercial settings (audited)", async () => {
    const customer = await signIn();
    const support = await signIn(undefined, ["SUPPORT_AGENT"]);
    const admin = await signIn(undefined, ["PLATFORM_ADMIN"]);
    for (const a of [customer.actor, support.actor]) {
      await expect(createCategory(a, { slug: "nails", nameAr: "أظافر", nameEn: "Nails" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(createCity(a, { nameAr: "جدة", nameEn: "Jeddah" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(setSetting(a, "commissionBps", 1000, "try")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await createCategory(admin.actor, { slug: "nails", nameAr: "أظافر", nameEn: "Nails" });
    await expect(createCategory(admin.actor, { slug: "nails", nameAr: "x x", nameEn: "y y" })).rejects.toMatchObject({ code: "CONFLICT" });
    const city = await createCity(admin.actor, { nameAr: "جدة", nameEn: "Jeddah" });
    await createDistrict(admin.actor, { cityId: city.id, nameAr: "الروضة", nameEn: "Ar Rawdah" });

    expect(await getSettings()).toEqual({ commissionBps: 0, vatBps: 0, paymentWindowMinutes: 15 }); // nothing charged until set
    await setSetting(admin.actor, "commissionBps", 1200, "board decision 12%");
    await expect(setSetting(admin.actor, "vatBps", 20_000, "bad value")).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getSettings()).commissionBps).toBe(1200);
    expect(await db.auditLog.findFirst({ where: { action: "settings.changed", reason: "board decision 12%" } })).not.toBeNull();
  });

  it("salon services, coverage and schedules require the right salon role; staff manage only themselves", async () => {
    const m = await marketplace();
    const colleague = await signIn();
    const cm = await addMember(m.owner.actor, m.salon.id, { phone: colleague.phone, role: "STAFF" });

    // Staff cannot create services, change salon coverage or salon policy.
    await expect(
      createSalonService(m.provider.actor, m.salon.id, { categoryId: m.category.id, nameAr: "صبغة", nameEn: "Color", durationMinutes: 90, priceSar: "300" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(upsertSalonCoverage(m.provider.actor, m.salon.id, { districtId: m.outArea.id, travelFeeSar: "0" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      updateSalonPolicy(m.provider.actor, m.salon.id, { travelBufferMinutes: 0, minNoticeMinutes: 0, maxAdvanceDays: 1, cancellationWindowHours: 0, acceptanceTimeoutMinutes: 5 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // …nor edit a colleague's schedule, skills or coverage.
    await expect(setWeeklyRules(m.provider.actor, m.salon.id, cm.id, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setStaffSkills(m.provider.actor, m.salon.id, cm.id, [m.service.id])).rejects.toMatchObject({ code: "FORBIDDEN" });
    // A provider's districts must lie inside the salon's area.
    await expect(setStaffCoverage(m.provider.actor, m.salon.id, m.membership.id, [m.outArea.id])).rejects.toMatchObject({ code: "VALIDATION" });
    // Overlapping working windows are refused.
    await expect(
      setWeeklyRules(m.provider.actor, m.salon.id, m.membership.id, [
        { weekday: 1, startMinute: 480, endMinute: 720 },
        { weekday: 1, startMinute: 700, endMinute: 900 },
      ]),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("payment methods: all present, individually switchable, only integrated ones usable", () => {
  it("PAYMENT_MODE=off: all seven are listed; online ones are NOT_INTEGRATED and cannot be switched on (no fake payments)", async () => {
    await withPaymentMode("off", async () => {
      const admin = await signIn(undefined, ["PLATFORM_ADMIN"]);
      const list = await listPlatformPaymentMethods(admin.actor);
      expect(list.map((m) => [m.method, m.state])).toEqual([
        ["CASH", "AVAILABLE"],
        ["MADA", "NOT_INTEGRATED"],
        ["CARD", "NOT_INTEGRATED"],
        ["APPLE_PAY", "NOT_INTEGRATED"],
        ["STC_PAY", "NOT_INTEGRATED"],
        ["TABBY", "NOT_INTEGRATED"],
        ["TAMARA", "NOT_INTEGRATED"],
      ]);
      await expect(setPlatformPaymentMethod(admin.actor, "APPLE_PAY", true, "launch")).rejects.toMatchObject({ code: "INTEGRATION_REQUIRED" });
      const customer = await signIn();
      await expect(listPlatformPaymentMethods(customer.actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("PAYMENT_MODE=sandbox: online methods start disabled, can be enabled, and are then labelled SANDBOX (never AVAILABLE/live)", async () => {
    await withPaymentMode("sandbox", async () => {
      const m = await marketplace();
      let list = await listPlatformPaymentMethods(m.admin.actor);
      expect(list.filter((x) => x.method !== "CASH").every((x) => x.state === "DISABLED_BY_PLATFORM" && !x.integrated)).toBe(true);
      await setPlatformPaymentMethod(m.admin.actor, "MADA", true, "sandbox testing");
      list = await listPlatformPaymentMethods(m.admin.actor);
      expect(list.find((x) => x.method === "MADA")).toMatchObject({ state: "SANDBOX", mode: "SANDBOX", integrated: false });
      // Salon may opt out of a sandbox method; staff cannot change it.
      await setSalonPaymentMethod(m.owner.actor, m.salon.id, "MADA", false);
      expect((await listSalonPaymentMethods(m.owner.actor, m.salon.id)).find((x) => x.method === "MADA")?.state).toBe("DISABLED_BY_SALON");
      await expect(setSalonPaymentMethod(m.provider.actor, m.salon.id, "MADA", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("switching cash off at the platform or the salon blocks cash bookings; switching back restores them", async () => {
    const m = await marketplace();
    const [slot] = await firstSlot(m);
    const attempt = () =>
      createBooking(m.customer.actor, { salonServiceId: m.service.id, addressId: m.address.id, startsAt: slot, paymentMethod: "CASH" });

    await setSalonPaymentMethod(m.owner.actor, m.salon.id, "CASH", false);
    expect((await listSalonPaymentMethods(m.owner.actor, m.salon.id))[0]).toMatchObject({ method: "CASH", state: "DISABLED_BY_SALON" });
    await expect(attempt()).rejects.toMatchObject({ code: "PAYMENT_METHOD_UNAVAILABLE" });
    await setSalonPaymentMethod(m.owner.actor, m.salon.id, "CASH", true);

    await setPlatformPaymentMethod(m.admin.actor, "CASH", false, "pause cash");
    await expect(attempt()).rejects.toMatchObject({ code: "PAYMENT_METHOD_UNAVAILABLE" });
    await expect(setSalonPaymentMethod(m.owner.actor, m.salon.id, "CASH", true)).rejects.toMatchObject({ code: "PAYMENT_METHOD_UNAVAILABLE" });
    await setPlatformPaymentMethod(m.admin.actor, "CASH", true, "resume cash");
    await expect(attempt()).resolves.toMatchObject({ paymentMethod: "CASH" });

    // Staff cannot change the salon's payment methods.
    await expect(setSalonPaymentMethod(m.provider.actor, m.salon.id, "CASH", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
