import { Prisma, type MembershipStatus, type SalonRole, type SalonStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, type Db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit/audit";
import { normalizeSaudiMobile } from "../auth/phone";
import { requirePlatformPermission, requireSalonPermission, type Actor } from "../rbac/authorize";

const nameSchema = z.string().trim().min(2).max(120);
const reasonSchema = z.string().trim().min(3).max(500);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message);
  return r.data;
}

/** Serializable transaction; write-skew on owner checks is reported as CONFLICT. */
async function serializable<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  try {
    return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") throw new AppError("CONFLICT");
    throw e;
  }
}

export async function createSalon(actor: Actor | null, input: { name: string }) {
  const a = requirePlatformPermission(actor, "salon.create");
  const name = parse(nameSchema, input.name);
  return db.$transaction(async (tx) => {
    const salon = await tx.salon.create({
      data: {
        name,
        slug: `s-${randomBytes(5).toString("hex")}`,
        createdById: a.id,
        memberships: { create: { userId: a.id, role: "OWNER" } },
      },
    });
    await audit(tx, { actorId: a.id, action: "salon.created", targetType: "Salon", targetId: salon.id, salonId: salon.id });
    return salon;
  });
}

export async function listMySalons(actor: Actor | null) {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  const memberships = await db.salonMembership.findMany({
    where: { userId: actor.id, status: "ACTIVE" },
    include: { salon: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({ role: m.role, salon: m.salon }));
}

export async function getSalon(actor: Actor | null, salonId: string) {
  const access = await requireSalonPermission(db, actor, salonId, "salon.profile.read");
  const salon = await db.salon.findUniqueOrThrow({ where: { id: salonId } });
  return { salon, role: access.role };
}

export async function renameSalon(actor: Actor | null, salonId: string, name: string) {
  const clean = parse(nameSchema, name);
  return db.$transaction(async (tx) => {
    const access = await requireSalonPermission(tx, actor, salonId, "salon.profile.manage");
    const before = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
    const salon = await tx.salon.update({ where: { id: salonId }, data: { name: clean } });
    await audit(tx, {
      actorId: access.actor.id,
      action: "salon.renamed",
      targetType: "Salon",
      targetId: salonId,
      salonId,
      metadata: { from: before.name, to: clean },
    });
    return salon;
  });
}

export async function listMembers(actor: Actor | null, salonId: string) {
  await requireSalonPermission(db, actor, salonId, "salon.members.read");
  return db.salonMembership.findMany({
    where: { salonId },
    include: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: "asc" },
  });
}

function assertCanAssign(actorRole: SalonRole | null, targetRole: SalonRole) {
  // Managers administer staff/managers but cannot create or modify owners.
  if (actorRole === "MANAGER" && targetRole === "OWNER") throw new AppError("FORBIDDEN", "manager cannot assign owner");
}

export async function addMember(actor: Actor | null, salonId: string, input: { phone: string; role: SalonRole }) {
  const phone = normalizeSaudiMobile(input.phone);
  const role = parse(z.enum(["OWNER", "MANAGER", "STAFF"]), input.role);
  return db.$transaction(async (tx) => {
    const access = await requireSalonPermission(tx, actor, salonId, "salon.members.manage");
    assertCanAssign(access.role, role);
    const user = await tx.user.findUnique({ where: { phone } });
    if (!user) throw new AppError("NOT_FOUND", "user_not_registered");
    const existing = await tx.salonMembership.findUnique({ where: { salonId_userId: { salonId, userId: user.id } } });
    if (existing?.status === "ACTIVE") throw new AppError("CONFLICT", "already_member");
    const membership = existing
      ? await tx.salonMembership.update({ where: { id: existing.id }, data: { role, status: "ACTIVE" } })
      : await tx.salonMembership.create({ data: { salonId, userId: user.id, role } });
    await audit(tx, {
      actorId: access.actor.id,
      action: "salon.member.added",
      targetType: "SalonMembership",
      targetId: membership.id,
      salonId,
      metadata: { userId: user.id, role },
    });
    return membership;
  });
}

export async function updateMember(
  actor: Actor | null,
  salonId: string,
  membershipId: string,
  input: { role?: SalonRole; status?: MembershipStatus },
) {
  const changes = parse(
    z.object({ role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional() }),
    input,
  );
  return serializable(async (tx) => {
    const access = await requireSalonPermission(tx, actor, salonId, "salon.members.manage");
    // Scope by salonId: a membership id from another salon is simply not found (tenant isolation).
    const m = await tx.salonMembership.findFirst({ where: { id: membershipId, salonId } });
    if (!m) throw new AppError("NOT_FOUND");
    if (access.role === "MANAGER" && m.role === "OWNER") throw new AppError("FORBIDDEN", "manager cannot modify owner");
    if (changes.role) assertCanAssign(access.role, changes.role);

    const losesOwner =
      m.role === "OWNER" && m.status === "ACTIVE" && ((changes.role && changes.role !== "OWNER") || changes.status === "DISABLED");
    if (losesOwner) {
      const owners = await tx.salonMembership.count({ where: { salonId, role: "OWNER", status: "ACTIVE" } });
      if (owners <= 1) throw new AppError("LAST_OWNER");
    }

    const updated = await tx.salonMembership.update({ where: { id: m.id }, data: changes });
    await audit(tx, {
      actorId: access.actor.id,
      action: "salon.member.updated",
      targetType: "SalonMembership",
      targetId: m.id,
      salonId,
      metadata: { from: { role: m.role, status: m.status }, to: changes },
    });
    return updated;
  });
}

export async function listAllSalons(actor: Actor | null) {
  requirePlatformPermission(actor, "platform.salons.read");
  return db.salon.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { memberships: true } } }, take: 200 });
}

export async function setSalonStatus(actor: Actor | null, salonId: string, status: SalonStatus, reason: string) {
  const a = requirePlatformPermission(actor, "platform.salons.manage");
  const why = parse(reasonSchema, reason);
  return db.$transaction(async (tx) => {
    const salon = await tx.salon.findUnique({ where: { id: salonId } });
    if (!salon) throw new AppError("NOT_FOUND");
    const updated = await tx.salon.update({ where: { id: salonId }, data: { status } });
    await audit(tx, {
      actorId: a.id,
      action: "salon.status_changed",
      targetType: "Salon",
      targetId: salonId,
      salonId,
      reason: why,
      metadata: { from: salon.status, to: status },
    });
    return updated;
  });
}

const policySchema = z.object({
  travelBufferMinutes: z.coerce.number().int().min(0).max(240),
  minNoticeMinutes: z.coerce.number().int().min(0).max(10_080),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  cancellationWindowHours: z.coerce.number().int().min(0).max(168),
  acceptanceTimeoutMinutes: z.coerce.number().int().min(5).max(1440),
});

/** Salon operating policy. Applies to new bookings only; existing bookings keep their snapshot. */
export async function updateSalonPolicy(actor: Actor | null, salonId: string, input: Record<string, unknown>) {
  const d = parse(policySchema, input);
  return db.$transaction(async (tx) => {
    const access = await requireSalonPermission(tx, actor, salonId, "salon.settings.manage");
    const before = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
    const salon = await tx.salon.update({ where: { id: salonId }, data: d });
    await audit(tx, {
      actorId: access.actor.id,
      action: "salon.policy.updated",
      targetType: "Salon",
      targetId: salonId,
      salonId,
      metadata: {
        from: {
          travelBufferMinutes: before.travelBufferMinutes,
          minNoticeMinutes: before.minNoticeMinutes,
          maxAdvanceDays: before.maxAdvanceDays,
          cancellationWindowHours: before.cancellationWindowHours,
          acceptanceTimeoutMinutes: before.acceptanceTimeoutMinutes,
        },
        to: d,
      },
    });
    return salon;
  });
}
