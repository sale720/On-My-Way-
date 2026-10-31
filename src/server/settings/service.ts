import { z } from "zod";
import { db, type Db } from "../db";
import { audit } from "../audit/audit";
import { requirePlatformPermission, type Actor } from "../rbac/authorize";
import { parse, reasonSchema } from "../validation";

/**
 * Commercial settings. Values live in the database and are edited by platform admins.
 * Defaults are 0 deliberately: no commission or VAT is charged until an admin sets it explicitly
 * (docs/PRICING_AND_COMMISSIONS.md).
 */
export const SETTING_DEFS = {
  commissionBps: { schema: z.coerce.number().int().min(0).max(10_000), default: 0 }, // basis points of the service subtotal
  vatBps: { schema: z.coerce.number().int().min(0).max(10_000), default: 0 }, // basis points applied to subtotal + travel fee
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;
export type PlatformSettings = { [K in SettingKey]: number };

export async function getSettings(tx: Db = db): Promise<PlatformSettings> {
  const rows = await tx.platformSetting.findMany({ where: { key: { in: Object.keys(SETTING_DEFS) } } });
  const out = {} as PlatformSettings;
  for (const key of Object.keys(SETTING_DEFS) as SettingKey[]) {
    const row = rows.find((r) => r.key === key);
    const parsed = row ? SETTING_DEFS[key].schema.safeParse(row.value) : undefined;
    out[key] = parsed?.success ? parsed.data : SETTING_DEFS[key].default;
  }
  return out;
}

export async function setSetting(actor: Actor | null, key: SettingKey, value: unknown, reason: string) {
  const a = requirePlatformPermission(actor, "platform.settings.manage");
  if (!(key in SETTING_DEFS)) throw new Error(`unknown setting ${key}`);
  const v = parse(SETTING_DEFS[key].schema, value);
  const why = parse(reasonSchema, reason);
  return db.$transaction(async (tx) => {
    const before = await tx.platformSetting.findUnique({ where: { key } });
    await tx.platformSetting.upsert({
      where: { key },
      create: { key, value: v, updatedById: a.id },
      update: { value: v, updatedById: a.id },
    });
    await audit(tx, {
      actorId: a.id,
      action: "settings.changed",
      targetType: "PlatformSetting",
      targetId: key,
      reason: why,
      metadata: { from: before?.value ?? null, to: v },
    });
  });
}
