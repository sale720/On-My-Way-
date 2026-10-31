import type { Prisma } from "@prisma/client";
import type { Db } from "../db";

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  salonId?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Records a sensitive action. Call inside the same transaction as the change it describes. */
export async function audit(tx: Db, entry: AuditEntry) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      salonId: entry.salonId ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata,
    },
  });
}
