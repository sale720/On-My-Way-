import type { Prisma } from "@prisma/client";
import { db, type Db } from "../db";
import { AppError } from "../errors";
import type { Actor } from "../rbac/authorize";

/**
 * In-app notifications (the only channel connected so far). External channels (SMS, email, push)
 * plug in later behind the same `notify` call; nothing here claims an external delivery.
 */
export async function notify(tx: Db, userIds: string[], type: string, payload: Prisma.InputJsonValue) {
  const unique = [...new Set(userIds)];
  if (unique.length) await tx.notification.createMany({ data: unique.map((userId) => ({ userId, type, payload })) });
}

export async function listMyNotifications(actor: Actor | null, take = 50) {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  return db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take });
}

export async function unreadCount(actor: Actor | null) {
  if (!actor) return 0;
  return db.notification.count({ where: { userId: actor.id, readAt: null } });
}

export async function markAllRead(actor: Actor | null) {
  if (!actor) throw new AppError("UNAUTHENTICATED");
  await db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
}
