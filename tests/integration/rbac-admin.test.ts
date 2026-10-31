import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resolveSession } from "@/server/auth/service";
import {
  bootstrapAdmin,
  grantRole,
  listAuditLog,
  listUsers,
  revokeRole,
  setUserStatus,
  updateProfile,
} from "@/server/users/service";
import { resetTestDb, signIn } from "../helpers";

beforeEach(resetTestDb);

describe("platform permissions are enforced on the server", () => {
  it("unauthenticated calls are rejected", async () => {
    await expect(listUsers(null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(updateProfile(null, { name: "x" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("a customer cannot list users, change statuses, grant roles or read the audit log", async () => {
    const { actor } = await signIn();
    const other = await signIn();
    await expect(listUsers(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setUserStatus(actor, other.userId, "SUSPENDED", "test reason")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(grantRole(actor, actor.id, "PLATFORM_ADMIN", "escalation")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listAuditLog(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.user.findUnique({ where: { id: other.userId } }))?.status).toBe("ACTIVE");
  });

  it("a support agent can read users with masked phones but cannot manage", async () => {
    const support = await signIn(undefined, ["SUPPORT_AGENT"]);
    const customer = await signIn();
    const users = await listUsers(support.actor);
    const row = users.find((u) => u.id === customer.userId)!;
    expect(row.phone).not.toBe(customer.phone);
    expect(row.phone).toContain("****");
    await expect(setUserStatus(support.actor, customer.userId, "SUSPENDED", "reason")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("an admin suspends a user: status persists, sessions are revoked, action is audited with reason", async () => {
    const admin = await signIn(undefined, ["PLATFORM_ADMIN"]);
    const target = await signIn();
    expect(await resolveSession(target.token)).not.toBeNull();

    await setUserStatus(admin.actor, target.userId, "SUSPENDED", "policy violation report #1");

    expect((await db.user.findUnique({ where: { id: target.userId } }))?.status).toBe("SUSPENDED");
    expect(await resolveSession(target.token)).toBeNull();
    const log = await db.auditLog.findFirst({ where: { action: "user.suspended", targetId: target.userId } });
    expect(log).toMatchObject({ actorId: admin.userId, reason: "policy violation report #1" });

    await setUserStatus(admin.actor, target.userId, "ACTIVE", "appeal accepted");
    expect((await db.user.findUnique({ where: { id: target.userId } }))?.status).toBe("ACTIVE");
  });

  it("sensitive actions require a reason, and an admin cannot suspend themself", async () => {
    const admin = await signIn(undefined, ["PLATFORM_ADMIN"]);
    const target = await signIn();
    await expect(setUserStatus(admin.actor, target.userId, "SUSPENDED", "")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setUserStatus(admin.actor, admin.userId, "SUSPENDED", "self")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("role grants take effect on the next request and are audited; admins cannot drop their own admin role", async () => {
    const admin = await signIn(undefined, ["PLATFORM_ADMIN"]);
    const target = await signIn();
    await grantRole(admin.actor, target.userId, "SUPPORT_AGENT", "new support hire");
    expect((await resolveSession(target.token))?.roles).toContain("SUPPORT_AGENT");
    await revokeRole(admin.actor, target.userId, "SUPPORT_AGENT", "left team");
    expect((await resolveSession(target.token))?.roles).not.toContain("SUPPORT_AGENT");
    expect(await db.auditLog.count({ where: { targetId: target.userId, action: { in: ["role.granted", "role.revoked"] } } })).toBe(2);
    await expect(revokeRole(admin.actor, admin.userId, "PLATFORM_ADMIN", "oops")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("CLI bootstrap grants admin only to an existing account and records a system audit entry", async () => {
    await expect(bootstrapAdmin("0599999999", "initial operator")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const u = await signIn();
    await bootstrapAdmin(u.phone, "initial operator");
    expect((await resolveSession(u.token))?.roles).toContain("PLATFORM_ADMIN");
    expect(await db.auditLog.findFirst({ where: { action: "role.granted", targetId: u.userId, actorId: null } })).not.toBeNull();
  });

  it("users can update their own profile and locale", async () => {
    const { actor, userId } = await signIn();
    await updateProfile(actor, { name: "  نورة  ", locale: "en" });
    expect(await db.user.findUnique({ where: { id: userId } })).toMatchObject({ name: "نورة", locale: "en" });
    await expect(updateProfile(actor, { name: "x".repeat(81) })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
