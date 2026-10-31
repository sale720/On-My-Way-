import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit/audit";
import { requirePlatformPermission, requireSalonPermission, requireSelfOrSalonPermission, type Actor } from "../rbac/authorize";
import { parse, sarToHalalas } from "../validation";

const nameSchema = z.string().trim().min(2).max(120);

// ── Platform catalog: categories ──
export async function listCategories(opts: { activeOnly?: boolean } = {}) {
  return db.serviceCategory.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
}

export async function createCategory(actor: Actor | null, input: { slug: string; nameAr: string; nameEn: string; sortOrder?: number }) {
  const a = requirePlatformPermission(actor, "platform.catalog.manage");
  const data = parse(
    z.object({
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
      nameAr: nameSchema,
      nameEn: nameSchema,
      sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    }),
    input,
  );
  return db.$transaction(async (tx) => {
    if (await tx.serviceCategory.findUnique({ where: { slug: data.slug } })) throw new AppError("CONFLICT");
    const c = await tx.serviceCategory.create({ data });
    await audit(tx, { actorId: a.id, action: "catalog.category.created", targetType: "ServiceCategory", targetId: c.id });
    return c;
  });
}

export async function setCategoryActive(actor: Actor | null, id: string, active: boolean) {
  const a = requirePlatformPermission(actor, "platform.catalog.manage");
  return db.$transaction(async (tx) => {
    const c = await tx.serviceCategory.update({ where: { id }, data: { active } });
    await audit(tx, { actorId: a.id, action: "catalog.category.active", targetType: "ServiceCategory", targetId: id, metadata: { active } });
    return c;
  });
}

// ── Salon services ──
const serviceInput = z.object({
  categoryId: z.string().min(1),
  nameAr: nameSchema,
  nameEn: nameSchema,
  descriptionAr: z.string().trim().max(1000).optional().transform((v) => v || null),
  descriptionEn: z.string().trim().max(1000).optional().transform((v) => v || null),
  durationMinutes: z.coerce.number().int().min(5).max(720),
  priceSar: sarToHalalas,
});

export async function listSalonServices(actor: Actor | null, salonId: string) {
  await requireSalonPermission(db, actor, salonId, "salon.profile.read");
  return db.salonService.findMany({
    where: { salonId },
    include: { category: true, staff: { select: { membershipId: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
}

export async function createSalonService(actor: Actor | null, salonId: string, input: Record<string, unknown>) {
  const d = parse(serviceInput, input);
  return db.$transaction(async (tx) => {
    const access = await requireSalonPermission(tx, actor, salonId, "salon.services.manage");
    const cat = await tx.serviceCategory.findUnique({ where: { id: d.categoryId } });
    if (!cat || !cat.active) throw new AppError("VALIDATION", "category");
    const s = await tx.salonService.create({
      data: {
        salonId,
        categoryId: d.categoryId,
        nameAr: d.nameAr,
        nameEn: d.nameEn,
        descriptionAr: d.descriptionAr,
        descriptionEn: d.descriptionEn,
        durationMinutes: d.durationMinutes,
        priceHalalas: d.priceSar,
      },
    });
    await audit(tx, { actorId: access.actor.id, action: "salon.service.created", targetType: "SalonService", targetId: s.id, salonId });
    return s;
  });
}

export async function updateSalonService(
  actor: Actor | null,
  salonId: string,
  serviceId: string,
  input: { priceSar?: unknown; durationMinutes?: unknown; active?: boolean },
) {
  const d = parse(
    z.object({
      priceSar: sarToHalalas.optional(),
      durationMinutes: z.coerce.number().int().min(5).max(720).optional(),
      active: z.boolean().optional(),
    }),
    input,
  );
  return db.$transaction(async (tx) => {
    const access = await requireSalonPermission(tx, actor, salonId, "salon.services.manage");
    const before = await tx.salonService.findFirst({ where: { id: serviceId, salonId } });
    if (!before) throw new AppError("NOT_FOUND");
    // Existing bookings keep their price/duration snapshot; only future bookings are affected.
    const s = await tx.salonService.update({
      where: { id: serviceId },
      data: { priceHalalas: d.priceSar, durationMinutes: d.durationMinutes, active: d.active },
    });
    await audit(tx, {
      actorId: access.actor.id,
      action: "salon.service.updated",
      targetType: "SalonService",
      targetId: serviceId,
      salonId,
      metadata: {
        from: { priceHalalas: before.priceHalalas, durationMinutes: before.durationMinutes, active: before.active },
        to: { priceHalalas: s.priceHalalas, durationMinutes: s.durationMinutes, active: s.active },
      },
    });
    return s;
  });
}

/** Replace the set of salon services a staff member can perform. */
export async function setStaffSkills(actor: Actor | null, salonId: string, membershipId: string, serviceIds: string[]) {
  return db.$transaction(async (tx) => {
    const access = await requireSelfOrSalonPermission(tx, actor, salonId, membershipId, "salon.staff.manage");
    const valid = await tx.salonService.findMany({ where: { salonId, id: { in: serviceIds } }, select: { id: true } });
    if (valid.length !== new Set(serviceIds).size) throw new AppError("VALIDATION", "service not in salon");
    await tx.staffService.deleteMany({ where: { membershipId } });
    if (valid.length) await tx.staffService.createMany({ data: valid.map((v) => ({ membershipId, salonServiceId: v.id })) });
    await audit(tx, { actorId: access.actor.id, action: "salon.staff.skills", targetType: "SalonMembership", targetId: membershipId, salonId, metadata: { serviceIds } });
  });
}
