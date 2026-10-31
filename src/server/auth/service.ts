import type { Locale } from "@prisma/client";
import { db, type Db } from "../db";
import { AppError } from "../errors";
import { logger, maskPhone } from "../logger";
import { audit } from "../audit/audit";
import type { Actor } from "../rbac/authorize";
import { smsProvider } from "../sms/provider";
import { generateOtpCode, generateSessionToken, hashOtp, hashSessionToken, safeEqualHex } from "./crypto";
import { normalizeSaudiMobile } from "./phone";
import { AUTH_POLICY } from "./policy";

const OTP_MESSAGE: Record<Locale, (code: string) => string> = {
  ar: (c) => `رمز الدخول إلى On My Way: ${c}. صالح لمدة 5 دقائق. لا تشاركه مع أحد.`,
  en: (c) => `Your On My Way login code is ${c}. Valid for 5 minutes. Do not share it.`,
};

/** Step 1: issue a one-time code. Responds identically whether or not the account exists. */
export async function requestOtp(input: { phone: string; ip?: string | null; locale?: Locale }) {
  const phone = normalizeSaudiMobile(input.phone);
  const since = new Date(Date.now() - AUTH_POLICY.otpWindowMs);

  const [perPhone, perIp] = await Promise.all([
    db.otpChallenge.count({ where: { phone, createdAt: { gte: since } } }),
    input.ip ? db.otpChallenge.count({ where: { requestIp: input.ip, createdAt: { gte: since } } }) : 0,
  ]);
  if (perPhone >= AUTH_POLICY.otpPerPhoneLimit || perIp >= AUTH_POLICY.otpPerIpLimit) {
    logger.warn("auth.otp.rate_limited", { phone, perPhone, perIp });
    throw new AppError("RATE_LIMITED");
  }

  const code = generateOtpCode();
  const now = new Date();
  await db.$transaction([
    // Only the newest code is ever valid.
    db.otpChallenge.updateMany({
      where: { phone, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    db.otpChallenge.create({
      data: {
        phone,
        codeHash: hashOtp(phone, code),
        expiresAt: new Date(now.getTime() + AUTH_POLICY.otpTtlMs),
        requestIp: input.ip ?? null,
      },
    }),
  ]);

  await smsProvider().send(phone, OTP_MESSAGE[input.locale ?? "ar"](code));
  logger.info("auth.otp.sent", { phone });
  return { phone };
}

/** Step 2: verify the code, create the account on first login, and open a session. */
export async function verifyOtp(input: { phone: string; code: string; userAgent?: string | null }) {
  const phone = normalizeSaudiMobile(input.phone);
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) throw new AppError("OTP_INVALID");

  const challenge = await db.otpChallenge.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) throw new AppError("OTP_INVALID");
  if (challenge.expiresAt <= new Date()) throw new AppError("OTP_EXPIRED");

  // Atomically consume one attempt; concurrent guesses cannot exceed the limit.
  const counted = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: AUTH_POLICY.otpMaxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) throw new AppError("OTP_LOCKED");

  if (!safeEqualHex(challenge.codeHash, hashOtp(phone, code))) {
    logger.warn("auth.otp.mismatch", { phone, attempt: challenge.attempts + 1 });
    throw new AppError(challenge.attempts + 1 >= AUTH_POLICY.otpMaxAttempts ? "OTP_LOCKED" : "OTP_INVALID");
  }

  const consumed = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) throw new AppError("OTP_INVALID"); // used concurrently

  const token = generateSessionToken();
  const result = await db.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { phone } });
    let created = false;
    if (!user) {
      user = await tx.user.create({ data: { phone, roles: { create: { role: "CUSTOMER" } } } });
      created = true;
      await audit(tx, { actorId: user.id, action: "user.registered", targetType: "User", targetId: user.id });
    }
    if (user.status !== "ACTIVE") throw new AppError("ACCOUNT_SUSPENDED");

    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + AUTH_POLICY.sessionTtlMs),
        userAgent: input.userAgent?.slice(0, 255) ?? null,
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user, created };
  });

  logger.info("auth.login", { userId: result.user.id, created: result.created, phone: maskPhone(phone) });
  return { token, userId: result.user.id, created: result.created };
}

export interface CurrentUser extends Actor {
  phone: string;
  name: string | null;
  locale: Locale;
}

/** Resolves a raw session token to an active user, or null. Checked on every request. */
export async function resolveSession(token: string | undefined | null, tx: Db = db): Promise<CurrentUser | null> {
  if (!token) return null;
  const session = await tx.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  return {
    id: session.user.id,
    phone: session.user.phone,
    name: session.user.name,
    locale: session.user.locale,
    roles: session.user.roles.map((r) => r.role),
  };
}

export async function revokeSession(token: string) {
  await db.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(tx: Db, userId: string) {
  await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
