/**
 * DEMO DATA for trying the platform (Codespaces / local). Development & test environments only.
 * - Refuses to run when APP_ENV=production.
 * - Never overwrites: if the database already has users it stops without changing anything.
 * - Everything it creates is labelled "تجريبي" (demo). Phone numbers are synthetic (+96650000000X).
 *
 * Usage: npm run demo:seed
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { env } from "../src/server/env";
import { PAYMENT_METHODS } from "../src/server/payments/methods";

export const DEMO_ACCOUNTS = [
  { key: "admin", phone: "+966500000001", name: "مديرة المنصة (تجريبي)", roles: ["CUSTOMER", "PLATFORM_ADMIN"] },
  { key: "owner", phone: "+966500000002", name: "مالكة الصالون (تجريبي)", roles: ["CUSTOMER", "PROVIDER"] },
  { key: "provider1", phone: "+966500000003", name: "نورة — مقدمة خدمة (تجريبي)", roles: ["CUSTOMER", "PROVIDER"] },
  { key: "provider2", phone: "+966500000004", name: "ريم — مقدمة خدمة (تجريبي)", roles: ["CUSTOMER", "PROVIDER"] },
  { key: "customer", phone: "+966500000005", name: "سارة — عميلة (تجريبي)", roles: ["CUSTOMER"] },
] as const;

async function main() {
  const e = env();
  if (e.APP_ENV === "production") throw new Error("demo seed is not allowed in production");
  if ((await db.user.count()) > 0) {
    console.log("Database already has users — demo seed skipped (nothing changed).");
    return;
  }

  await db.$transaction(async (tx) => {
    const users: Record<string, string> = {};
    for (const a of DEMO_ACCOUNTS) {
      const u = await tx.user.create({
        data: { phone: a.phone, name: a.name, roles: { create: a.roles.map((role) => ({ role })) } },
      });
      users[a.key] = u.id;
    }

    const city = await tx.city.create({ data: { nameAr: "الرياض", nameEn: "Riyadh" } });
    const districtNames = [
      ["الملقا", "Al Malqa"],
      ["النرجس", "An Narjis"],
      ["الياسمين", "Al Yasmin"],
      ["العليا", "Al Olaya"],
    ];
    const districts: { id: string }[] = [];
    for (const [nameAr, nameEn] of districtNames) districts.push(await tx.district.create({ data: { cityId: city.id, nameAr, nameEn } }));

    const cats = {
      hair: await tx.serviceCategory.create({ data: { slug: "hair", nameAr: "الشعر", nameEn: "Hair", sortOrder: 1 } }),
      makeup: await tx.serviceCategory.create({ data: { slug: "makeup", nameAr: "المكياج", nameEn: "Makeup", sortOrder: 2 } }),
      nails: await tx.serviceCategory.create({ data: { slug: "nails", nameAr: "الأظافر", nameEn: "Nails", sortOrder: 3 } }),
    };

    const salon = await tx.salon.create({
      data: {
        name: "صالون النخبة (تجريبي)",
        slug: "demo-elite",
        status: "ACTIVE",
        createdById: users.owner,
        travelBufferMinutes: 30,
        minNoticeMinutes: 60,
        maxAdvanceDays: 30,
        cancellationWindowHours: 24,
        acceptanceTimeoutMinutes: 60,
      },
    });
    const fees = [2500, 2500, 3500]; // SAR 25, 25, 35 — first three districts; Al Olaya is NOT covered (to see exclusions)
    for (let i = 0; i < 3; i++) await tx.salonCoverageArea.create({ data: { salonId: salon.id, districtId: districts[i].id, travelFeeHalalas: fees[i] } });

    const services = [
      { categoryId: cats.hair.id, nameAr: "قص وتصفيف", nameEn: "Cut & style", durationMinutes: 60, priceHalalas: 15000 },
      { categoryId: cats.hair.id, nameAr: "صبغة كاملة", nameEn: "Full color", durationMinutes: 120, priceHalalas: 35000 },
      { categoryId: cats.makeup.id, nameAr: "مكياج سهرة", nameEn: "Evening makeup", durationMinutes: 90, priceHalalas: 40000 },
      { categoryId: cats.nails.id, nameAr: "مناكير وبديكير", nameEn: "Mani & pedi", durationMinutes: 75, priceHalalas: 18000 },
    ];
    const created: { id: string }[] = [];
    for (const s of services) created.push(await tx.salonService.create({ data: { ...s, salonId: salon.id } }));

    const owner = await tx.salonMembership.create({ data: { salonId: salon.id, userId: users.owner, role: "OWNER" } });
    const p1 = await tx.salonMembership.create({ data: { salonId: salon.id, userId: users.provider1, role: "STAFF" } });
    const p2 = await tx.salonMembership.create({ data: { salonId: salon.id, userId: users.provider2, role: "STAFF" } });
    void owner;

    // Provider 1: hair + nails, covers Al Malqa & An Narjis. Provider 2: makeup + hair cut, covers all three.
    await tx.staffService.createMany({
      data: [
        { membershipId: p1.id, salonServiceId: created[0].id },
        { membershipId: p1.id, salonServiceId: created[1].id },
        { membershipId: p1.id, salonServiceId: created[3].id },
        { membershipId: p2.id, salonServiceId: created[0].id },
        { membershipId: p2.id, salonServiceId: created[2].id },
      ],
    });
    await tx.staffCoverage.createMany({
      data: [
        { membershipId: p1.id, districtId: districts[0].id },
        { membershipId: p1.id, districtId: districts[1].id },
        ...[0, 1, 2].map((i) => ({ membershipId: p2.id, districtId: districts[i].id })),
      ],
    });
    // Sat–Thu 09:00–21:00, Friday 16:00–22:00 (Riyadh time)
    for (const m of [p1.id, p2.id]) {
      await tx.availabilityRule.createMany({
        data: [0, 1, 2, 3, 4, 6]
          .map((weekday) => ({ membershipId: m, weekday, startMinute: 9 * 60, endMinute: 21 * 60 }))
          .concat([{ membershipId: m, weekday: 5, startMinute: 16 * 60, endMinute: 22 * 60 }]),
      });
    }

    await tx.customerAddress.create({
      data: { userId: users.customer, label: "المنزل", districtId: districts[0].id, street: "شارع تجريبي 10", building: "7", instructions: "البوابة الشرقية" },
    });
    await tx.customerAddress.create({
      data: { userId: users.customer, label: "بيت الأهل", districtId: districts[3].id, street: "شارع تجريبي 22" },
    });

    // In sandbox mode every method is switched on so it can be tried; otherwise only cash.
    for (const p of PAYMENT_METHODS) {
      await tx.paymentMethodConfig.create({ data: { method: p.method, enabled: p.method === "CASH" || e.PAYMENT_MODE === "sandbox", updatedById: users.admin } });
    }
    await tx.auditLog.create({
      data: { actorId: null, action: "demo.seeded", targetType: "System", targetId: "demo", reason: "demo data for testing (not production)" },
    });
  });

  console.log("Demo data created. Sign in with any of these numbers; read the code at /dev/sms:");
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.phone.replace("+966", "0")}  ${a.name}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
