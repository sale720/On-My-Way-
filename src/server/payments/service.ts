import type { PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { db, type Db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit/audit";
import { requirePlatformPermission, requireSalonPermission, type Actor } from "../rbac/authorize";
import { parse, reasonSchema } from "../validation";
import { defaultPlatformEnabled, methodMode, PAYMENT_METHODS, type MethodMode } from "./methods";

const methodSchema = z.enum(["CASH", "MADA", "CARD", "APPLE_PAY", "STC_PAY", "TABBY", "TAMARA"]);

/**
 * AVAILABLE   – usable with a live provider (real money)
 * SANDBOX     – usable through the sandbox gateway (testing; no real money)
 * NOT_INTEGRATED, DISABLED_BY_PLATFORM, DISABLED_BY_SALON – visible but not selectable
 */
export type MethodState = "AVAILABLE" | "SANDBOX" | "NOT_INTEGRATED" | "DISABLED_BY_PLATFORM" | "DISABLED_BY_SALON";
export const isSelectable = (s: MethodState) => s === "AVAILABLE" || s === "SANDBOX";

export interface MethodStatus {
  method: PaymentMethod;
  kind: string;
  integrated: boolean;
  mode: MethodMode;
  requires: string | null;
  platformEnabled: boolean;
  salonEnabled: boolean | null;
  state: MethodState;
}

async function platformFlags(tx: Db) {
  const rows = await tx.paymentMethodConfig.findMany();
  return new Map(PAYMENT_METHODS.map((p) => [p.method, rows.find((r) => r.method === p.method)?.enabled ?? defaultPlatformEnabled(p.method)]));
}

function stateFor(mode: MethodMode, platformEnabled: boolean, salonEnabled: boolean | null): MethodState {
  if (mode === "NONE") return "NOT_INTEGRATED";
  if (!platformEnabled) return "DISABLED_BY_PLATFORM";
  if (salonEnabled === false) return "DISABLED_BY_SALON";
  return mode === "LIVE" ? "AVAILABLE" : "SANDBOX";
}

/** Platform view: every method with its integration and switch state. Readable by platform admins. */
export async function listPlatformPaymentMethods(actor: Actor | null): Promise<MethodStatus[]> {
  requirePlatformPermission(actor, "platform.payments.manage");
  const flags = await platformFlags(db);
  return PAYMENT_METHODS.map((p) => {
    const mode = methodMode(p.method);
    const platformEnabled = flags.get(p.method)!;
    return { ...p, mode, platformEnabled, salonEnabled: null, state: stateFor(mode, platformEnabled, null) };
  });
}

export async function setPlatformPaymentMethod(actor: Actor | null, method: string, enabled: boolean, reason: string) {
  const a = requirePlatformPermission(actor, "platform.payments.manage");
  const m = parse(methodSchema, method);
  const why = parse(reasonSchema, reason);
  if (enabled && methodMode(m) === "NONE") throw new AppError("INTEGRATION_REQUIRED");
  await db.$transaction(async (tx) => {
    await tx.paymentMethodConfig.upsert({
      where: { method: m },
      create: { method: m, enabled, updatedById: a.id },
      update: { enabled, updatedById: a.id },
    });
    await audit(tx, {
      actorId: a.id,
      action: "payments.platform_method",
      targetType: "PaymentMethod",
      targetId: m,
      reason: why,
      metadata: { enabled, mode: methodMode(m) },
    });
  });
}

/** Effective state of every method for one salon (used by salon settings and checkout). */
export async function salonPaymentMethodStatuses(salonId: string, tx: Db = db): Promise<MethodStatus[]> {
  const [flags, salonRows] = await Promise.all([platformFlags(tx), tx.salonPaymentMethod.findMany({ where: { salonId } })]);
  return PAYMENT_METHODS.map((p) => {
    const mode = methodMode(p.method);
    const platformEnabled = flags.get(p.method)!;
    const salonEnabled = salonRows.find((r) => r.method === p.method)?.enabled ?? true; // salons inherit by default
    return { ...p, mode, platformEnabled, salonEnabled, state: stateFor(mode, platformEnabled, salonEnabled) };
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
      if (status.mode === "NONE") throw new AppError("INTEGRATION_REQUIRED");
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
