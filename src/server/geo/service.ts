import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit/audit";
import {
  requirePlatformPermission,
  requireSalonPermission,
  requireSelfOrSalonPermission,
  type Actor,
} from "../rbac/authorize";
import { parse, sarToHalalas } from "../validation";

const nameSchema = z.string().trim().min(2).max(80);

// ── Reference geography (admin-managed) ──
export async function listCities(opts: { activeOnly?: boolean } = {}) {
  return db.city.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: { nameEn: "asc" },
    include: { districts: { where: opts.activeOnly ? { active: true } : undefined, orderBy: { nameEn: "asc" } } },
  });
}

export async function createCity(actor: Actor | null, input: { nameAr: string; nameEn: string }) {
  const a = requirePlatformPermission(actor, "platform.geo.manage");
  const d = parse(z.object({ nameAr: nameSchema, nameEn: nameSchema }), input);
  return db.$transaction(async (tx) => {
    if (await tx.city.findUnique({ where: { nameEn: d.nameEn } })) throw new AppError("CONFLICT");
    const c = await tx.city.create({ data: d });
    await audit(tx, { actorId: a.id, action: "geo.city.created", targetType: "City", targetId: c.id });
    return c;
  });
}

export async function createDistrict(actor: Actor | null, input: { cityId: string; nameAr: string; nameEn: string }) {
  const a = requirePlatformPermission(actor, "platform.geo.manage");
  const d = parse(z.object({ cityId: z.string().min(1), nameAr: nameSchema, nameEn: nameSchema }), input);
  return db.$transaction(async (tx) => {
    if (!(await tx.city.findUnique({ where: { id: d.cityId } }))) throw new AppError("NOT_FOUND");
    if (await tx.district.findUnique({ where: { cityId_nameEn: { cityId: d.cityId, nameEn: d.nameEn } } })) throw new AppError("CONFLICT");
    const x = await tx.district.create({ data: d });
    await audit(tx, { actorId: a.id, action: "geo.district.created", targetType: "District", targetId: x.id });
    return x;
  });
}

export async function setDistrictActive(actor: Actor | null, districtId: string, active: boolean) {
  const a = requirePlatformPermission(actor, "platform.geo.manage");
  return db.$transaction(async (tx) => {
    const x = await tx.district.update({ where: { id: districtId }, data: { active } });
    await audit(tx, { actorId: a.id, action: "geo.district.active", targetType: "District", targetId: districtId, metadata: { active } });
    return x;
  });
}

// ── Salon coverage (level 1) ──
export async function listSalonCoverage(actor: Actor | null, salonId: string) {
  await requireSalonPermission(db, actor, salonId, "salon.profile.read");
  return db.salonCoverageArea.findMany({
    where: { salonId },
    include: { district: { include: { city: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Add or update a district in the salon's area. Changing coverage never cancels existing bookings. */
export async function upsertSalonCoverage(
  actor: Actor | null,
  salonId: string,
  input: { districtId: string; travelFeeSar: unknown; active?: boolean },
) {
  const d = parse(
    z.object({ districtId: z.string().min(1), travelFeeSar: sarToHalalas, active: z.boolean().default(true) }),
    input,
  );
  return db.$transaction(async (tx) => {
    const access = await requireSalonPermission(tx, actor, salonId, "salon.coverage.manage");
    const district = await tx.district.findUnique({ where: { id: d.districtId } });
    if (!district || !district.active) throw new AppError("VALIDATION", "district");
    const row = await tx.salonCoverageArea.upsert({
      where: { salonId_districtId: { salonId, districtId: d.districtId } },
      create: { salonId, districtId: d.districtId, travelFeeHalalas: d.travelFeeSar, active: d.active },
      update: { travelFeeHalalas: d.travelFeeSar, active: d.active },
    });
    await audit(tx, {
      actorId: access.actor.id,
      action: "salon.coverage.changed",
      targetType: "SalonCoverageArea",
      targetId: row.id,
      salonId,
      metadata: { districtId: d.districtId, travelFeeHalalas: d.travelFeeSar, active: d.active },
    });
    return row;
  });
}

// ── Staff coverage (level 2) ──
/** Replace a provider's own districts. Every district must be inside the salon's active area. */
export async function setStaffCoverage(actor: Actor | null, salonId: string, membershipId: string, districtIds: string[]) {
  return db.$transaction(async (tx) => {
    const access = await requireSelfOrSalonPermission(tx, actor, salonId, membershipId, "salon.staff.manage");
    const unique = [...new Set(districtIds)];
    const inSalon = await tx.salonCoverageArea.count({ where: { salonId, active: true, districtId: { in: unique } } });
    if (inSalon !== unique.length) throw new AppError("VALIDATION", "district outside salon coverage");
    await tx.staffCoverage.deleteMany({ where: { membershipId } });
    if (unique.length) await tx.staffCoverage.createMany({ data: unique.map((districtId) => ({ membershipId, districtId })) });
    await audit(tx, { actorId: access.actor.id, action: "salon.staff.coverage", targetType: "SalonMembership", targetId: membershipId, salonId, metadata: { districtIds: unique } });
  });
}

// ── Customer addresses ──
const addressInput = z.object({
  label: z.string().trim().max(40).optional().transform((v) => v || null),
  districtId: z.string().min(1),
  street: z.string().trim().min(3).max(200),
  building: z.string().trim().max(40).optional().transform((v) => v || null),
  floor: z.string().trim().max(20).optional().transform((v) => v || null),
  instructions: z.string().trim().max(300).optional().transform((v) => v || null),
  latitude: z.coerce.number().min(16).max(33).optional(), // Saudi Arabia bounding box
  longitude: z.coerce.number().min(34).max(56).optional(),
});

export async function listMyAddresses(actor: Actor | null) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  return db.customerAddress.findMany({
    where: { userId: a.id, deletedAt: null },
    include: { district: { include: { city: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createAddress(actor: Actor | null, input: Record<string, unknown>) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  const d = parse(addressInput, input);
  const district = await db.district.findUnique({ where: { id: d.districtId } });
  if (!district || !district.active) throw new AppError("VALIDATION", "district");
  return db.customerAddress.create({ data: { ...d, userId: a.id } });
}

export async function deleteAddress(actor: Actor | null, addressId: string) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  const r = await db.customerAddress.updateMany({ where: { id: addressId, userId: a.id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (r.count === 0) throw new AppError("NOT_FOUND");
}

/** Address owned by the actor (never another customer's). */
export async function ownedAddress(actorId: string, addressId: string) {
  const addr = await db.customerAddress.findFirst({
    where: { id: addressId, userId: actorId, deletedAt: null },
    include: { district: { include: { city: true } } },
  });
  if (!addr) throw new AppError("NOT_FOUND");
  return addr;
}
