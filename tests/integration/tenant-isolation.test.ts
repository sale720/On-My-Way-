import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  addMember,
  createSalon,
  getSalon,
  listAllSalons,
  listMembers,
  listMySalons,
  renameSalon,
  setSalonStatus,
  updateMember,
} from "@/server/salons/service";
import { resetTestDb, signIn } from "../helpers";

beforeEach(resetTestDb);

async function twoSalons() {
  const ownerA = await signIn();
  const ownerB = await signIn();
  const salonA = await createSalon(ownerA.actor, { name: "صالون أ" });
  const salonB = await createSalon(ownerB.actor, { name: "Salon B" });
  return { ownerA, ownerB, salonA, salonB };
}

describe("salon (tenant) isolation", () => {
  it("creating a salon makes the creator OWNER, status PENDING_REVIEW, and is audited", async () => {
    const { ownerA, salonA } = await twoSalons();
    expect(salonA.status).toBe("PENDING_REVIEW");
    const mine = await listMySalons(ownerA.actor);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ role: "OWNER", salon: { id: salonA.id } });
    expect(await db.auditLog.findFirst({ where: { action: "salon.created", salonId: salonA.id } })).not.toBeNull();
  });

  it("an owner of salon A cannot read or modify salon B (gets NOT_FOUND, no existence leak)", async () => {
    const { ownerA, salonB } = await twoSalons();
    await expect(getSalon(ownerA.actor, salonB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listMembers(ownerA.actor, salonB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(renameSalon(ownerA.actor, salonB.id, "hijack")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addMember(ownerA.actor, salonB.id, { phone: ownerA.phone, role: "OWNER" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await db.salon.findUnique({ where: { id: salonB.id } }))?.name).toBe("Salon B");
  });

  it("a membership id from salon B cannot be edited through salon A", async () => {
    const { ownerA, salonA, salonB } = await twoSalons();
    const bMembership = await db.salonMembership.findFirstOrThrow({ where: { salonId: salonB.id } });
    await expect(updateMember(ownerA.actor, salonA.id, bMembership.id, { status: "DISABLED" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await db.salonMembership.findUnique({ where: { id: bMembership.id } }))?.status).toBe("ACTIVE");
  });

  it("staff can read the salon profile but not its members", async () => {
    const { ownerA, salonA } = await twoSalons();
    const staff = await signIn();
    await addMember(ownerA.actor, salonA.id, { phone: staff.phone, role: "STAFF" });
    await expect(getSalon(staff.actor, salonA.id)).resolves.toMatchObject({ role: "STAFF" });
    await expect(listMembers(staff.actor, salonA.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(renameSalon(staff.actor, salonA.id, "x y")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a manager can add staff but cannot create or modify owners", async () => {
    const { ownerA, salonA } = await twoSalons();
    const manager = await signIn();
    const staff = await signIn();
    const extra = await signIn();
    await addMember(ownerA.actor, salonA.id, { phone: manager.phone, role: "MANAGER" });
    await expect(addMember(manager.actor, salonA.id, { phone: staff.phone, role: "STAFF" })).resolves.toBeTruthy();
    await expect(addMember(manager.actor, salonA.id, { phone: extra.phone, role: "OWNER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const ownerMembership = await db.salonMembership.findFirstOrThrow({ where: { salonId: salonA.id, role: "OWNER" } });
    await expect(updateMember(manager.actor, salonA.id, ownerMembership.id, { status: "DISABLED" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("the last active owner cannot be demoted or disabled", async () => {
    const { ownerA, salonA } = await twoSalons();
    const own = await db.salonMembership.findFirstOrThrow({ where: { salonId: salonA.id, role: "OWNER" } });
    await expect(updateMember(ownerA.actor, salonA.id, own.id, { role: "STAFF" })).rejects.toMatchObject({ code: "LAST_OWNER" });
    await expect(updateMember(ownerA.actor, salonA.id, own.id, { status: "DISABLED" })).rejects.toMatchObject({
      code: "LAST_OWNER",
    });
    // With a second owner, the first may step down.
    const second = await signIn();
    await addMember(ownerA.actor, salonA.id, { phone: second.phone, role: "OWNER" });
    await expect(updateMember(ownerA.actor, salonA.id, own.id, { role: "MANAGER" })).resolves.toMatchObject({ role: "MANAGER" });
  });

  it("a disabled member loses access immediately", async () => {
    const { ownerA, salonA } = await twoSalons();
    const manager = await signIn();
    const m = await addMember(ownerA.actor, salonA.id, { phone: manager.phone, role: "MANAGER" });
    await expect(listMembers(manager.actor, salonA.id)).resolves.toHaveLength(2);
    await updateMember(ownerA.actor, salonA.id, m.id, { status: "DISABLED" });
    await expect(listMembers(manager.actor, salonA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("adding an unregistered phone or a duplicate member is refused", async () => {
    const { ownerA, salonA } = await twoSalons();
    await expect(addMember(ownerA.actor, salonA.id, { phone: "0598765432", role: "STAFF" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(addMember(ownerA.actor, salonA.id, { phone: ownerA.phone, role: "STAFF" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("platform support can read any salon but cannot modify it; admins can change status with a reason", async () => {
    const { salonA } = await twoSalons();
    const support = await signIn(undefined, ["SUPPORT_AGENT"]);
    const admin = await signIn(undefined, ["PLATFORM_ADMIN"]);
    await expect(getSalon(support.actor, salonA.id)).resolves.toMatchObject({ role: null });
    await expect(listAllSalons(support.actor)).resolves.toHaveLength(2);
    await expect(renameSalon(support.actor, salonA.id, "changed")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setSalonStatus(support.actor, salonA.id, "ACTIVE", "approve")).rejects.toMatchObject({ code: "FORBIDDEN" });

    await setSalonStatus(admin.actor, salonA.id, "ACTIVE", "documents verified");
    expect((await db.salon.findUnique({ where: { id: salonA.id } }))?.status).toBe("ACTIVE");
    expect(
      await db.auditLog.findFirst({ where: { action: "salon.status_changed", salonId: salonA.id, reason: "documents verified" } }),
    ).not.toBeNull();
  });

  it("a customer cannot list all salons", async () => {
    const { ownerA } = await twoSalons();
    await expect(listAllSalons(ownerA.actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
