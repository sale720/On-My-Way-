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
  "platform.catalog.manage",
  "platform.geo.manage",
  "platform.settings.manage",
  "platform.payments.manage",
  "platform.bookings.read",
  "platform.bookings.manage",
  "platform.reports.read",
  "customer.profile.manage",
  "customer.bookings.manage",
  "salon.create",
] as const;

export const SALON_PERMISSIONS = [
  "salon.profile.read",
  "salon.profile.manage",
  "salon.members.read",
  "salon.members.manage",
  "salon.services.manage",
  "salon.coverage.manage",
  "salon.staff.manage", // skills, coverage and schedule of *other* staff
  "salon.bookings.read", // all salon bookings (staff always see their own)
  "salon.bookings.manage", // act on any salon booking (staff act on their own)
  "salon.settings.manage",
  "salon.payments.manage",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type SalonPermission = (typeof SALON_PERMISSIONS)[number];

const CUSTOMER_BASE: PlatformPermission[] = ["customer.profile.manage", "customer.bookings.manage", "salon.create"];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  CUSTOMER: CUSTOMER_BASE,
  PROVIDER: CUSTOMER_BASE,
  SUPPORT_AGENT: [
    "customer.profile.manage",
    "customer.bookings.manage",
    "platform.users.read",
    "platform.salons.read",
    "platform.bookings.read",
  ],
  PLATFORM_ADMIN: [
    ...CUSTOMER_BASE,
    "platform.users.read",
    "platform.users.manage",
    "platform.roles.manage",
    "platform.salons.read",
    "platform.salons.manage",
    "platform.audit.read",
    "platform.catalog.manage",
    "platform.geo.manage",
    "platform.settings.manage",
    "platform.payments.manage",
    "platform.bookings.read",
    "platform.bookings.manage",
    "platform.reports.read",
  ],
};

export const SALON_ROLE_PERMISSIONS: Record<SalonRole, readonly SalonPermission[]> = {
  OWNER: [...SALON_PERMISSIONS],
  MANAGER: [
    "salon.profile.read",
    "salon.members.read",
    "salon.members.manage",
    "salon.services.manage",
    "salon.coverage.manage",
    "salon.staff.manage",
    "salon.bookings.read",
    "salon.bookings.manage",
  ],
  STAFF: ["salon.profile.read"],
};

export function platformPermissionsFor(roles: readonly PlatformRole[]): Set<PlatformPermission> {
  return new Set(roles.flatMap((r) => PLATFORM_ROLE_PERMISSIONS[r]));
}

export function salonRoleHas(role: SalonRole, permission: SalonPermission): boolean {
  return SALON_ROLE_PERMISSIONS[role].includes(permission);
}
