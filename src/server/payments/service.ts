import type { PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { db, type Db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit/audit";
import { requirePlatformPermission, requireSalonPermission, type Actor } from "../rbac/authorize";
import { parse, reasonSchema } from "../validation";
import { defaultPlatformEnabled, methodInfo, PAYMENT_METHODS } from "./methods";

const methodSchema = z.enum(["CASH", "MADA", "CARD", "APPLE_PAY", "STC_PAY", "TABBY", "TAMARA"]);

export type MethodState = "AVAILABLE" | "NOT_INTEGRATED" | "DISABLED_BY_PLATFORM" | "DISABLED_BY_SALON";

export interface MethodStatus {
  method: PaymentMethod;
  kind: string;
  integrated: boolean;
  requires: string | null;
  platformEnabled: boolean;
  salonEnabled: boolean | null;
  state: MethodState;
}

async function platformFlags(tx: Db) {
  const rows = await tx.paymentMethodConfig.findMany();
  return new Map(PAYMENT_METHODS.map((p) => [p.method, rows.find((r) => r.method === p.method)?.enabled ?? defaultPlatformEnabled(p.method)]));
}

/** Platform view: every method with its integration and switch state. Readable by platform admins. */
export async function listPlatformPaymentMethods(actor: Actor | null): Promise<MethodStatus[]> {
  requirePlatformPermission(actor, "platform.payments.manage");
  const flags = await platformFlags(db);
  return PAYMENT_METHODS.map((p) => ({
    ...p,
    platformEnabled: flags.get(p.method)!,
    salonEnabled: null,
    state: !p.integrated ? "NOT_INTEGRATED" : flags.get(p.method) ? "AVAILABLE" : "DISABLED_BY_PLATFORM",
  }));
}

export async function setPlatformPaymentMethod(actor: Actor | null, method: string, enabled: boolean, reason: string) {
  const a = requirePlatformPermission(actor, "platform.payments.manage");
  const m = parse(methodSchema, method);
  const why = parse(reasonSchema, reason);
  if (enabled && !methodInfo(m).integrated) throw new AppError("INTEGRATION_REQUIRED");
  await db.$transaction(async (tx) => {
    await tx.paymentMethodConfig.upsert({
      where: { method: m },
      create: { method: m, enabled, updatedById: a.id },
      update: { enabled, updatedById: a.id },
    });
    await audit(tx, { actorId: a.id, action: "payments.platform_method", targetType: "PaymentMethod", targetId: m, reason: why, metadata: { enabled } });
  });
}

/** Effective state of every method for one salon (used by salon settings and checkout). */
export async function salonPaymentMethodStatuses(salonId: string, tx: Db = db): Promise<MethodStatus[]> {
  const [flags, salonRows] = await Promise.all([platformFlags(tx), tx.salonPaymentMethod.findMany({ where: { salonId } })]);
  return PAYMENT_METHODS.map((p) => {
    const platformEnabled = flags.get(p.method)!;
    const salonEnabled = salonRows.find((r) => r.method === p.method)?.enabled ?? true; // salons inherit by default
    const state: MethodState = !p.integrated
      ? "NOT_INTEGRATED"
      : !platformEnabled
        ? "DISABLED_BY_PLATFORM"
        : !salonEnabled
          ? "DISABLED_BY_SALON"
          : "AVAILABLE";
    return { ...p, platformEnabled, salonEnabled, state };
  });
}

export async function listSalonPaymentMethods(actor: Actor | null, salonId: string) {
  await requireSalonPermission(db, actor, salonId, "salon.profile.read");
  return salonPaymentMethodStatuses(salonId);
}

export async function setSalonPaymentMethod(actor: Actor | null, salonId: string, method: string, enabled: boolean) {
  const m = parse(methodSchema, method);
  await db.$transaction(async (tx) => {
    const access = await requireSalonPermission(tx, actor, salonId, "salon.payments.manage");
    if (enabled) {
      const status = (await salonPaymentMethodStatuses(salonId, tx)).find((s) => s.method === m)!;
      if (!status.integrated) throw new AppError("INTEGRATION_REQUIRED");
      if (!status.platformEnabled) throw new AppError("PAYMENT_METHOD_UNAVAILABLE");
    }
    await tx.salonPaymentMethod.upsert({
      where: { salonId_method: { salonId, method: m } },
      create: { salonId, method: m, enabled },
      update: { enabled },
    });
    await audit(tx, { actorId: access.actor.id, action: "payments.salon_method", targetType: "PaymentMethod", targetId: m, salonId, metadata: { enabled } });
  });
}
