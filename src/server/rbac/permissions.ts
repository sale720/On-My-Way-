import type { PlatformRole, SalonRole } from "@prisma/client";

/**
 * Permission catalogue. Role → permission mapping is versioned in code (docs/DECISIONS.md, D-006);
 * role *assignments* are stored in the database and enforced on the server.
 */
export const PLATFORM_PERMISSIONS = [
  "platform.users.read",
  "platform.users.manage",
  "platform.roles.manage",
  "platform.salons.read",
  "platform.salons.manage",
  "platform.audit.read",
  "customer.profile.manage",
  "salon.create",
] as const;

export const SALON_PERMISSIONS = [
  "salon.profile.read",
  "salon.profile.manage",
  "salon.members.read",
  "salon.members.manage",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type SalonPermission = (typeof SALON_PERMISSIONS)[number];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  CUSTOMER: ["customer.profile.manage", "salon.create"],
  PROVIDER: ["customer.profile.manage", "salon.create"],
  SUPPORT_AGENT: ["customer.profile.manage", "platform.users.read", "platform.salons.read"],
  PLATFORM_ADMIN: [
    "customer.profile.manage",
    "salon.create",
    "platform.users.read",
    "platform.users.manage",
    "platform.roles.manage",
    "platform.salons.read",
    "platform.salons.manage",
    "platform.audit.read",
  ],
};

export const SALON_ROLE_PERMISSIONS: Record<SalonRole, readonly SalonPermission[]> = {
  OWNER: ["salon.profile.read", "salon.profile.manage", "salon.members.read", "salon.members.manage"],
  MANAGER: ["salon.profile.read", "salon.members.read", "salon.members.manage"],
  STAFF: ["salon.profile.read"],
};

export function platformPermissionsFor(roles: readonly PlatformRole[]): Set<PlatformPermission> {
  return new Set(roles.flatMap((r) => PLATFORM_ROLE_PERMISSIONS[r]));
}

export function salonRoleHas(role: SalonRole, permission: SalonPermission): boolean {
  return SALON_ROLE_PERMISSIONS[role].includes(permission);
}
