import { db } from "@/server/db";
import { MemorySmsProvider, smsProvider } from "@/server/sms/provider";
import { requestOtp, resolveSession, verifyOtp } from "@/server/auth/service";
import type { PlatformRole } from "@prisma/client";

/** Empties the isolated test database between tests (guarded: test DB only). */
export async function resetTestDb() {
  const name = new URL(process.env.DATABASE_URL!).pathname;
  if (process.env.APP_ENV !== "test" || !/test/i.test(name)) throw new Error("resetTestDb outside test DB");
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} RESTART IDENTITY CASCADE`);
  (smsProvider() as MemorySmsProvider).outbox.length = 0;
}

export function lastOtp(phone: string): string {
  const msg = (smsProvider() as MemorySmsProvider).lastTo(phone);
  const code = msg?.body.match(/\d{6}/)?.[0];
  if (!code) throw new Error(`no OTP captured for ${phone}`);
  return code;
}

let seq = 0;
/** Unique synthetic Saudi mobile numbers (test DB only; not real people). */
export function testPhone() {
  seq += 1;
  return `+9665${String(10_000_000 + seq).slice(-8)}`;
}

/** Signs a user in through the real OTP flow and returns the resolved actor + token. */
export async function signIn(phone = testPhone(), extraRoles: PlatformRole[] = []) {
  await requestOtp({ phone, ip: `10.0.0.${(seq % 250) + 1}` });
  const { token, userId } = await verifyOtp({ phone, code: lastOtp(phone) });
  for (const role of extraRoles) {
    await db.platformRoleAssignment.upsert({
      where: { userId_role: { userId, role } },
      create: { userId, role },
      update: {},
    });
  }
  const actor = await resolveSession(token);
  if (!actor) throw new Error("sign-in failed");
  return { actor, token, phone, userId };
}
