import type { Locale, PlatformRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit/audit";
import { revokeAllSessions } from "../auth/service";
import { maskPhone } from "../logger";
import { hasPlatformPermission, requirePlatformPermission, type Actor } from "../rbac/authorize";
import { normalizeSaudiMobile } from "../auth/phone";

const reasonSchema = z.string().trim().min(3).max(500);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message);
  return r.data;
}

export async function updateProfile(actor: Actor | null, input: { name?: string | null; locale?: Locale }) {
  const a = requirePlatformPermission(actor, "customer.profile.manage");
  const data = parse(
    z.object({
      name: z
        .string()
        .trim()
        .max(80)
        .transform((v) => (v === "" ? null : v))
        .nullable()
        .optional(),
      locale: z.enum(["ar", "en"]).optional(),
    }),
    input,
  );
  return db.user.update({ where: { id: a.id }, data, select: { id: true, name: true, locale: true } });
}

export async function listUsers(actor: Actor | null, input: { q?: string; take?: number; skip?: number } = {}) {
  const a = requirePlatformPermission(actor, "platform.users.read");
  const canSeeFullPhone = hasPlatformPermission(a, "platform.users.manage");
  const q = input.q?.trim();
  const users = await db.user.findMany({
    where: q ? { OR: [{ phone: { contains: q } }, { name: { contains: q, mode: "insensitive" } }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(input.take ?? 50, 100),
    skip: input.skip ?? 0,
    include: { roles: { select: { role: true } } },
  });
  return users.map((u) => ({
    id: u.id,
    phone: canSeeFullPhone ? u.phone : maskPhone(u.phone),
    name: u.name,
    status: u.status,
    roles: u.roles.map((r) => r.role),
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  }));
}

export async function setUserStatus(actor: Actor | null, userId: string, status: UserStatus, reason: string) {
  const a = requirePlatformPermission(actor, "platform.users.manage");
  const why = parse(reasonSchema, reason);
  if (a.id === userId) throw new AppError("FORBIDDEN", "cannot change own status");

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("NOT_FOUND");
    if (user.status === status) return user;
    const updated = await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === "SUSPENDED") await revokeAllSessions(tx, userId);
    await audit(tx, {
      actorId: a.id,
      action: status === "SUSPENDED" ? "user.suspended" : "user.activated",
      targetType: "User",
      targetId: userId,
      reason: why,
      metadata: { from: user.status, to: status },
    });
    return updated;
  });
}

export async function grantRole(actor: Actor | null, userId: string, role: PlatformRole, reason: string) {
  const a = requirePlatformPermission(actor, "platform.roles.manage");
  const why = parse(reasonSchema, reason);
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("NOT_FOUND");
    const existing = await tx.platformRoleAssignment.findUnique({ where: { userId_role: { userId, role } } });
    if (existing) return existing;
    const created = await tx.platformRoleAssignment.create({ data: { userId, role, grantedById: a.id } });
    await audit(tx, { actorId: a.id, action: "role.granted", targetType: "User", targetId: userId, reason: why, metadata: { role } });
    return created;
  });
}

export async function revokeRole(actor: Actor | null, userId: string, role: PlatformRole, reason: string) {
  const a = requirePlatformPermission(actor, "platform.roles.manage");
  const why = parse(reasonSchema, reason);
  if (a.id === userId && role === "PLATFORM_ADMIN") throw new AppError("FORBIDDEN", "cannot revoke own admin role");
  return db.$transaction(async (tx) => {
    const deleted = await tx.platformRoleAssignment.deleteMany({ where: { userId, role } });
    if (deleted.count === 0) throw new AppError("NOT_FOUND");
    await audit(tx, { actorId: a.id, action: "role.revoked", targetType: "User", targetId: userId, reason: why, metadata: { role } });
  });
}

/**
 * Operator bootstrap (CLI only): grants PLATFORM_ADMIN to an existing account.
 * The account must already exist (the person signed in at least once). Recorded with actorId=null.
 */
export async function bootstrapAdmin(phoneInput: string, reason: string) {
  const phone = normalizeSaudiMobile(phoneInput);
  const why = parse(reasonSchema, reason);
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { phone } });
    if (!user) throw new AppError("NOT_FOUND", "user must sign in once before being made admin");
    await tx.platformRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: "PLATFORM_ADMIN" } },
      create: { userId: user.id, role: "PLATFORM_ADMIN" },
      update: {},
    });
    await audit(tx, {
      actorId: null,
      action: "role.granted",
      targetType: "User",
      targetId: user.id,
      reason: why,
      metadata: { role: "PLATFORM_ADMIN", via: "cli" },
    });
    return user.id;
  });
}

export async function listAuditLog(actor: Actor | null, input: { take?: number } = {}) {
  requirePlatformPermission(actor, "platform.audit.read");
  return db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(input.take ?? 100, 200),
    include: { actor: { select: { id: true, name: true } } },
  });
}
