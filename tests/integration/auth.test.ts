import { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { requestOtp, resolveSession, revokeSession, verifyOtp } from "@/server/auth/service";
import { AUTH_POLICY } from "@/server/auth/policy";
import { lastOtp, resetTestDb, signIn, testPhone } from "../helpers";

beforeEach(resetTestDb);

describe("OTP sign-in", () => {
  it("registers a new user with the CUSTOMER role and persists it", async () => {
    const phone = testPhone();
    await requestOtp({ phone: phone.replace("+966", "0"), ip: "1.1.1.1" });
    const res = await verifyOtp({ phone, code: lastOtp(phone) });
    expect(res.created).toBe(true);

    // Read back through an independent connection: proves the write was committed to PostgreSQL.
    const fresh = new PrismaClient();
    try {
      const user = await fresh.user.findUnique({ where: { phone }, include: { roles: true } });
      expect(user?.roles.map((r) => r.role)).toEqual(["CUSTOMER"]);
      const audit = await fresh.auditLog.findFirst({ where: { action: "user.registered", targetId: user!.id } });
      expect(audit).not.toBeNull();
      // Neither the OTP nor the session token is stored in clear text.
      const otp = await fresh.otpChallenge.findFirst({ where: { phone } });
      expect(otp?.codeHash).not.toContain(lastOtp(phone));
      const session = await fresh.session.findFirst({ where: { userId: user!.id } });
      expect(session?.tokenHash).not.toBe(res.token);
    } finally {
      await fresh.$disconnect();
    }
  });

  it("logs an existing user in without creating a duplicate", async () => {
    const { phone, userId } = await signIn();
    await requestOtp({ phone, ip: "1.1.1.2" });
    const again = await verifyOtp({ phone, code: lastOtp(phone) });
    expect(again.created).toBe(false);
    expect(again.userId).toBe(userId);
    expect(await db.user.count({ where: { phone } })).toBe(1);
  });

  it("rejects a wrong code and locks after the maximum attempts", async () => {
    const phone = testPhone();
    await requestOtp({ phone, ip: "1.1.1.3" });
    const good = lastOtp(phone);
    const bad = good === "000000" ? "111111" : "000000";
    for (let i = 1; i < AUTH_POLICY.otpMaxAttempts; i++) {
      await expect(verifyOtp({ phone, code: bad })).rejects.toMatchObject({ code: "OTP_INVALID" });
    }
    await expect(verifyOtp({ phone, code: bad })).rejects.toMatchObject({ code: "OTP_LOCKED" });
    // Even the right code is refused once locked.
    await expect(verifyOtp({ phone, code: good })).rejects.toMatchObject({ code: "OTP_LOCKED" });
  });

  it("rejects an expired code", async () => {
    const phone = testPhone();
    await requestOtp({ phone, ip: "1.1.1.4" });
    await db.otpChallenge.updateMany({ where: { phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(verifyOtp({ phone, code: lastOtp(phone) })).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("does not allow a code to be reused", async () => {
    const phone = testPhone();
    await requestOtp({ phone, ip: "1.1.1.5" });
    const code = lastOtp(phone);
    await verifyOtp({ phone, code });
    await expect(verifyOtp({ phone, code })).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("invalidates the previous code when a new one is requested", async () => {
    const phone = testPhone();
    await requestOtp({ phone, ip: "1.1.1.6" });
    const first = lastOtp(phone);
    await requestOtp({ phone, ip: "1.1.1.6" });
    const second = lastOtp(phone);
    if (first !== second) {
      await expect(verifyOtp({ phone, code: first })).rejects.toMatchObject({ code: "OTP_INVALID" });
    }
    await expect(verifyOtp({ phone, code: second })).resolves.toMatchObject({ created: true });
  });

  it("rate-limits OTP requests per phone", async () => {
    const phone = testPhone();
    for (let i = 0; i < AUTH_POLICY.otpPerPhoneLimit; i++) await requestOtp({ phone, ip: `2.2.2.${i}` });
    await expect(requestOtp({ phone, ip: "2.2.2.99" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rate-limits OTP requests per IP", async () => {
    for (let i = 0; i < AUTH_POLICY.otpPerIpLimit; i++) await requestOtp({ phone: testPhone(), ip: "3.3.3.3" });
    await expect(requestOtp({ phone: testPhone(), ip: "3.3.3.3" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rejects malformed phone numbers and codes", async () => {
    await expect(requestOtp({ phone: "12345" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(verifyOtp({ phone: testPhone(), code: "12ab" })).rejects.toMatchObject({ code: "OTP_INVALID" });
  });
});

describe("sessions", () => {
  it("resolves a valid session and rejects unknown tokens", async () => {
    const { token, userId } = await signIn();
    expect((await resolveSession(token))?.id).toBe(userId);
    expect(await resolveSession("not-a-real-token")).toBeNull();
    expect(await resolveSession(undefined)).toBeNull();
  });

  it("logout revokes the session", async () => {
    const { token } = await signIn();
    await revokeSession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it("expired sessions are rejected", async () => {
    const { token, userId } = await signIn();
    await db.session.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveSession(token)).toBeNull();
  });

  it("a suspended user cannot sign in", async () => {
    const { phone, userId } = await signIn();
    await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    await requestOtp({ phone, ip: "4.4.4.4" });
    await expect(verifyOtp({ phone, code: lastOtp(phone) })).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  });
});
