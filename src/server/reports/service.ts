import { db } from "../db";
import { requirePlatformPermission, type Actor } from "../rbac/authorize";

/**
 * Basic platform report. Every figure is read live from the database; definitions:
 *   bookingsByStatus      – count of bookings per current status (all time)
 *   completedGmvHalalas   – Σ totalHalalas of COMPLETED bookings (gross value incl. travel fee and VAT)
 *   commissionHalalas     – Σ commissionHalalas of COMPLETED bookings (platform's gross commission, before gateway fees)
 *   cashCollectedHalalas  – Σ Payment.amountHalalas with method CASH and status PAID
 *   last30DaysCreated     – bookings created in the last 30 days
 *   completionRate        – COMPLETED / (COMPLETED + CANCELLED + REJECTED + NO_SHOW); null when no closed bookings
 */
export async function platformReport(actor: Actor | null, now = new Date()) {
  requirePlatformPermission(actor, "platform.reports.read");
  const [byStatus, completed, cash, recent, activeSalons, users] = await Promise.all([
    db.booking.groupBy({ by: ["status"], _count: true }),
    db.booking.aggregate({ where: { status: "COMPLETED" }, _sum: { totalHalalas: true, commissionHalalas: true } }),
    db.payment.aggregate({ where: { method: "CASH", status: "PAID" }, _sum: { amountHalalas: true } }),
    db.booking.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
    db.salon.count({ where: { status: "ACTIVE" } }),
    db.user.count(),
  ]);
  const count = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const closed = count("COMPLETED") + count("CANCELLED") + count("REJECTED") + count("NO_SHOW");
  return {
    bookingsByStatus: Object.fromEntries(byStatus.map((x) => [x.status, x._count])),
    completedGmvHalalas: completed._sum.totalHalalas ?? 0,
    commissionHalalas: completed._sum.commissionHalalas ?? 0,
    cashCollectedHalalas: cash._sum.amountHalalas ?? 0,
    last30DaysCreated: recent,
    completionRate: closed ? count("COMPLETED") / closed : null,
    activeSalons,
    users,
  };
}
