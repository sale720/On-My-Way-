import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { requirePlatformPermission, type Actor } from "../rbac/authorize";
import { notify } from "../notifications/service";
import { parse } from "../validation";

const score = z.coerce.number().int().min(1).max(5);

/** One review per completed booking, only by the customer who booked it (reference §14.1–14.2). */
export async function createReview(
  actor: Actor | null,
  bookingId: string,
  input: { rating: unknown; punctuality?: unknown; quality?: unknown; comment?: unknown },
) {
  const a = requirePlatformPermission(actor, "customer.bookings.manage");
  const d = parse(
    z.object({
      rating: score,
      punctuality: score.optional(),
      quality: score.optional(),
      comment: z.string().trim().max(1000).optional().transform((v) => v || null),
    }),
    {
      ...input,
      punctuality: input.punctuality === "" ? undefined : input.punctuality,
      quality: input.quality === "" ? undefined : input.quality,
    },
  );
  return db.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { review: true } });
    if (!b || b.customerId !== a.id) throw new AppError("NOT_FOUND");
    if (b.status !== "COMPLETED") throw new AppError("INVALID_TRANSITION", "only completed bookings can be reviewed");
    if (b.review) throw new AppError("ALREADY_REVIEWED");
    const r = await tx.review.create({
      data: {
        bookingId,
        customerId: a.id,
        salonId: b.salonId,
        staffMembershipId: b.staffMembershipId,
        rating: d.rating,
        punctuality: d.punctuality ?? null,
        quality: d.quality ?? null,
        comment: d.comment,
      },
    });
    const staff = await tx.salonMembership.findUnique({ where: { id: b.staffMembershipId } });
    if (staff) await notify(tx, [staff.userId], "review.created", { bookingId, rating: d.rating });
    return r;
  });
}

export async function salonRating(salonId: string) {
  const agg = await db.review.aggregate({ where: { salonId }, _avg: { rating: true }, _count: true });
  return { avg: agg._avg.rating, count: agg._count };
}
