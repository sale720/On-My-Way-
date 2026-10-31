import type { PlatformRole, SalonMembership, SalonRole } from "@prisma/client";
import type { Db } from "../db";
import { AppError } from "../errors";
import { platformPermissionsFor, salonRoleHas, type PlatformPermission, type SalonPermission } from "./permissions";

/** The authenticated principal, resolved from a valid session on every request. */
export interface Actor {
  id: string;
  roles: PlatformRole[];
}

export function hasPlatformPermission(actor: Actor, permission: PlatformPermission): boolean {
  return platformPermissionsFor(actor.roles).has(permission);
}

export function requirePlatformPermission(actor: Actor | null, permission: PlatformPermission): Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  if (!hasPlatformPermission(actor, permission)) throw new AppError("FORBIDDEN", `missing ${permission}`);
  return actor;
}

export interface SalonAccess {
  actor: Actor;
  salonId: string;
  /** null when access is granted via a platform-level permission rather than membership. */
  membership: SalonMembership | null;
  role: SalonRole | null;
}

/**
 * Tenant isolation gate: every salon-scoped operation must pass through here.
 * Access requires an ACTIVE membership whose role grants the permission. Platform staff
 * with platform.salons.read get read-only access; platform.salons.manage is required to write.
 * Non-members receive NOT_FOUND (not FORBIDDEN) so salon existence is not leaked.
 */
export async function requireSalonPermission(
  tx: Db,
  actor: Actor | null,
  salonId: string,
  permission: SalonPermission,
): Promise<SalonAccess> {
  if (!actor) throw new AppError("UNAUTHENTICATED");

  const membership = await tx.salonMembership.findUnique({
    where: { salonId_userId: { salonId, userId: actor.id } },
  });

  if (membership && membership.status === "ACTIVE") {
    if (salonRoleHas(membership.role, permission)) {
      return { actor, salonId, membership, role: membership.role };
    }
    throw new AppError("FORBIDDEN", `salon role ${membership.role} lacks ${permission}`);
  }

  const isRead = permission.endsWith(".read");
  const platformPerm: PlatformPermission = isRead ? "platform.salons.read" : "platform.salons.manage";
  if (hasPlatformPermission(actor, platformPerm)) {
    const exists = await tx.salon.findUnique({ where: { id: salonId }, select: { id: true } });
    if (!exists) throw new AppError("NOT_FOUND");
    return { actor, salonId, membership: null, role: null };
  }

  throw new AppError("NOT_FOUND");
}
