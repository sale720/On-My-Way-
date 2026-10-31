import { db } from "@/server/db";
import { createCategory } from "@/server/catalog/service";
import { createSalonService, setStaffSkills } from "@/server/catalog/service";
import { createAddress, createCity, createDistrict, setStaffCoverage, upsertSalonCoverage } from "@/server/geo/service";
import { setWeeklyRules } from "@/server/availability/service";
import { addMember, createSalon, setSalonStatus, updateSalonPolicy } from "@/server/salons/service";
import { getOfferSlots } from "@/server/bookings/search";
import { addDays, riyadhDate } from "@/server/time";
import { signIn } from "./helpers";

/**
 * A complete, realistic marketplace built only through the public services (no direct inserts):
 * admin → geography + category; owner → active salon with coverage, service, provider schedule;
 * customer → address inside the covered district. Synthetic test data only.
 */
export async function marketplace(opts: { minNoticeMinutes?: number } = {}) {
  const admin = await signIn(undefined, ["PLATFORM_ADMIN"]);
  const city = await createCity(admin.actor, { nameAr: "الرياض", nameEn: "Riyadh" });
  const inArea = await createDistrict(admin.actor, { cityId: city.id, nameAr: "الملقا", nameEn: "Al Malqa" });
  const outArea = await createDistrict(admin.actor, { cityId: city.id, nameAr: "العزيزية", nameEn: "Al Aziziyah" });
  const category = await createCategory(admin.actor, { slug: "hair", nameAr: "الشعر", nameEn: "Hair" });

  const owner = await signIn();
  const salon = await createSalon(owner.actor, { name: "صالون الاختبار" });
  await setSalonStatus(admin.actor, salon.id, "ACTIVE", "documents verified");
  await updateSalonPolicy(owner.actor, salon.id, {
    travelBufferMinutes: 30,
    minNoticeMinutes: opts.minNoticeMinutes ?? 60,
    maxAdvanceDays: 30,
    cancellationWindowHours: 24,
    acceptanceTimeoutMinutes: 60,
  });
  await upsertSalonCoverage(owner.actor, salon.id, { districtId: inArea.id, travelFeeSar: "25" });
  const service = await createSalonService(owner.actor, salon.id, {
    categoryId: category.id,
    nameAr: "قص شعر",
    nameEn: "Haircut",
    durationMinutes: 60,
    priceSar: "150",
  });

  const provider = await signIn();
  const membership = await addMember(owner.actor, salon.id, { phone: provider.phone, role: "STAFF" });
  await setStaffSkills(provider.actor, salon.id, membership.id, [service.id]);
  await setStaffCoverage(provider.actor, salon.id, membership.id, [inArea.id]);
  await setWeeklyRules(
    provider.actor,
    salon.id,
    membership.id,
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 })),
  );

  const customer = await signIn();
  const address = await createAddress(customer.actor, { districtId: inArea.id, street: "شارع الاختبار 1", building: "12" });
  const farAddress = await createAddress(customer.actor, { districtId: outArea.id, street: "شارع بعيد 9" });

  return { admin, city, inArea, outArea, category, owner, salon, service, provider, membership, customer, address, farAddress };
}

/** First free slot tomorrow (Riyadh) for the customer's address. */
export async function firstSlot(
  m: Awaited<ReturnType<typeof marketplace>>,
  customer = m.customer,
  addressId = m.address.id,
  dayOffset = 1,
) {
  const date = addDays(riyadhDate(new Date()), dayOffset);
  const res = await getOfferSlots(customer.actor, { salonServiceId: m.service.id, addressId, date });
  if (!res.slots.length) throw new Error("no slots in fixture");
  return res.slots;
}

export async function bookingRow(id: string) {
  return db.booking.findUniqueOrThrow({ where: { id }, include: { payments: true, history: true, items: true } });
}
