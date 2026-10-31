import { z } from "zod";
import { db, type Db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit/audit";
import { requireSelfOrSalonPermission, type Actor } from "../rbac/authorize";
import { isDateStr } from "../time";
import { parse } from "../validation";

/** Statuses that hold a provider's time (mirrors the DB exclusion constraint). */
export const BLOCKING_STATUSES = [
  "PENDING_PROVIDER_ACCEPTANCE",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "ASSIGNED",
  "PROVIDER_EN_ROUTE",
  "PROVIDER_ARRIVED",
  "IN_PROGRESS",
] as const;

const ruleSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(1).max(1440),
  })
  .refine((r) => r.startMinute < r.endMinute, "start must be before end");

export async function getSchedule(actor: Actor | null, salonId: string, membershipId: string) {
  await requireSelfOrSalonPermission(db, actor, salonId, membershipId, "salon.staff.manage");
  const [rules, exceptions] = await Promise.all([
    db.availabilityRule.findMany({ where: { membershipId }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    db.availabilityException.findMany({ where: { membershipId, date: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { date: "asc" } }),
  ]);
  return { rules, exceptions };
}

/** Replace the weekly working hours. Windows on the same day must not overlap. */
export async function setWeeklyRules(actor: Actor | null, salonId: string, membershipId: string, rules: unknown[]) {
  const parsed = rules.map((r) => parse(ruleSchema, r));
  for (let d = 0; d < 7; d++) {
    const day = parsed.filter((r) => r.weekday === d).sort((a, b) => a.startMinute - b.startMinute);
    for (let k = 1; k < day.length; k++) if (day[k].startMinute < day[k - 1].endMinute) throw new AppError("VALIDATION", "overlapping windows");
  }
  return db.$transaction(async (tx) => {
    const access = await requireSelfOrSalonPermission(tx, actor, salonId, membershipId, "salon.staff.manage");
    await tx.availabilityRule.deleteMany({ where: { membershipId } });
    if (parsed.length) await tx.availabilityRule.createMany({ data: parsed.map((r) => ({ ...r, membershipId })) });
    // Existing bookings are not cancelled by schedule changes (they remain commitments).
    await audit(tx, { actorId: access.actor.id, action: "salon.staff.schedule", targetType: "SalonMembership", targetId: membershipId, salonId, metadata: { rules: parsed } });
  });
}

export async function addException(actor: Actor | null, salonId: string, membershipId: string, date: string, reason?: string) {
  if (!isDateStr(date)) throw new AppError("VALIDATION", "date");
  return db.$transaction(async (tx) => {
    const access = await requireSelfOrSalonPermission(tx, actor, salonId, membershipId, "salon.staff.manage");
    const row = await tx.availabilityException.upsert({
      where: { membershipId_date: { membershipId, date: new Date(`${date}T00:00:00Z`) } },
      create: { membershipId, date: new Date(`${date}T00:00:00Z`), reason: reason?.slice(0, 200) || null },
      update: { reason: reason?.slice(0, 200) || null },
    });
    await audit(tx, { actorId: access.actor.id, action: "salon.staff.day_off", targetType: "SalonMembership", targetId: membershipId, salonId, metadata: { date } });
    return row;
  });
}

export async function removeException(actor: Actor | null, salonId: string, membershipId: string, exceptionId: string) {
  return db.$transaction(async (tx) => {
    await requireSelfOrSalonPermission(tx, actor, salonId, membershipId, "salon.staff.manage");
    const r = await tx.availabilityException.deleteMany({ where: { id: exceptionId, membershipId } });
    if (r.count === 0) throw new AppError("NOT_FOUND");
  });
}

/** Everything the slot engine needs for a set of providers around one date. */
export async function loadProviderCalendars(tx: Db, membershipIds: string[], date: string) {
  const dayStart = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000);
  const dayEnd = new Date(Date.parse(`${date}T00:00:00Z`) + 2 * 86_400_000);
  const [rules, exceptions, bookings] = await Promise.all([
    tx.availabilityRule.findMany({ where: { membershipId: { in: membershipIds } } }),
    tx.availabilityException.findMany({ where: { membershipId: { in: membershipIds }, date: new Date(`${date}T00:00:00Z`) } }),
    tx.booking.findMany({
      where: {
        staffMembershipId: { in: membershipIds },
        status: { in: [...BLOCKING_STATUSES] },
        blockedFrom: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { staffMembershipId: true, blockedFrom: true, endsAt: true },
    }),
  ]);
  return new Map(
    membershipIds.map((id) => [
      id,
      {
        rules: rules.filter((r) => r.membershipId === id),
        exceptionDates: exceptions.filter((e) => e.membershipId === id).map(() => date),
        busy: bookings.filter((b) => b.staffMembershipId === id).map((b) => ({ from: b.blockedFrom, to: b.endsAt })),
      },
    ]),
  );
}
