import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { parseEnv, resetEnvCache } from "@/server/env";
import { createBooking, expireStalePendingBookings, getBooking, transitionBooking } from "@/server/bookings/service";
import { handleGatewayEvent, refundBookingPayment, simulateSandboxPayment, startCheckout } from "@/server/payments/checkout";
import { SANDBOX_CARDS, SANDBOX_SIGNATURE_HEADER, signSandboxEvent } from "@/server/payments/sandbox";
import { setPlatformPaymentMethod } from "@/server/payments/service";
import { SandboxSmsProvider, listSandboxSms } from "@/server/sms/provider";
import { listMyNotifications } from "@/server/notifications/service";
import { resetTestDb, signIn } from "../helpers";
import { bookingRow, firstSlot, marketplace } from "../fixtures";

beforeEach(resetTestDb);

type M = Awaited<ReturnType<typeof marketplace>>;

async function onlineBooking(m: M, method: "MADA" | "APPLE_PAY" = "MADA", slotIndex = 0) {
  await setPlatformPaymentMethod(m.admin.actor, method, true, "sandbox testing");
  const slot = (await firstSlot(m))[slotIndex];
  const b = await createBooking(m.customer.actor, { salonServiceId: m.service.id, addressId: m.address.id, startsAt: slot, paymentMethod: method });
  const url = await startCheckout(m.customer.actor, b.id);
  const ref = url.split("/").pop()!;
  return { b, slot, url, ref };
}

describe("sandbox payments — full online flow", () => {
  it("an online booking holds the slot as PENDING_PAYMENT and the provider is not asked yet", async () => {
    const m = await marketplace();
    const { b, url } = await onlineBooking(m);
    expect(b.status).toBe("PENDING_PAYMENT");
    expect(url).toMatch(/^\/pay\/sandbox\/sbx_[0-9a-f]{20}$/);
    expect(await listMyNotifications(m.provider.actor)).toHaveLength(0);
    // The held slot is not offered to others.
    expect((await firstSlot(m)).some((s) => s.getTime() === b.startsAt.getTime())).toBe(false);
    // Starting checkout again resumes the same charge (idempotent).
    expect(await startCheckout(m.customer.actor, b.id)).toBe(url);
  });

  it("approved test card → PAID → request goes to the provider → accepted → customer cancels → refunded", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    await simulateSandboxPayment(m.customer.actor, ref, { outcome: "approve", cardNumber: "4111 1111 1111 1111" });

    let row = await bookingRow(b.id);
    expect(row).toMatchObject({ status: "PENDING_PROVIDER_ACCEPTANCE", paymentStatus: "PAID" });
    expect(row.payments[0]).toMatchObject({ status: "PAID", provider: "sandbox", providerRef: ref });
    expect(row.history.map((h) => [h.to, h.reason])).toEqual([
      ["PENDING_PAYMENT", null],
      ["PENDING_PROVIDER_ACCEPTANCE", "payment_received"],
    ]);
    expect((await listMyNotifications(m.provider.actor))[0].type).toBe("booking.requested");

    await transitionBooking(m.provider.actor, b.id, "CONFIRMED");
    await transitionBooking(m.customer.actor, b.id, "CANCELLED", "تغيّرت الخطة", new Date(b.startsAt.getTime() - 48 * 3600_000));

    row = await bookingRow(b.id);
    expect(row).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    const refunds = await db.refund.findMany({ where: { paymentId: row.payments[0].id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ status: "SUCCEEDED", amountHalalas: row.totalHalalas });
    expect(refunds[0].providerRef).toMatch(/^sbxr_/);
    expect(await db.auditLog.findFirst({ where: { action: "payment.refunded", targetId: b.id } })).not.toBeNull();
  });

  it("declined test card → booking cancelled (payment_failed) and the slot is released", async () => {
    const m = await marketplace();
    const { b, ref, slot } = await onlineBooking(m);
    await simulateSandboxPayment(m.customer.actor, ref, { outcome: "approve", cardNumber: SANDBOX_CARDS.decline });
    const row = await bookingRow(b.id);
    expect(row).toMatchObject({ status: "CANCELLED", paymentStatus: "FAILED", cancelReason: "payment_failed" });
    expect((await firstSlot(m)).some((s) => s.getTime() === slot.getTime())).toBe(true);
  });

  it("a non-test card number is refused and nothing changes", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    await expect(simulateSandboxPayment(m.customer.actor, ref, { outcome: "approve", cardNumber: "5555 5555 5555 4444" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await bookingRow(b.id)).status).toBe("PENDING_PAYMENT");
  });

  it("wallet methods (Apple Pay) use approve/decline", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m, "APPLE_PAY");
    await simulateSandboxPayment(m.customer.actor, ref, { outcome: "approve" });
    expect((await bookingRow(b.id)).paymentStatus).toBe("PAID");
  });

  it("the provider rejecting a paid request refunds the customer", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    await simulateSandboxPayment(m.customer.actor, ref, { outcome: "approve", cardNumber: SANDBOX_CARDS.approve });
    await transitionBooking(m.provider.actor, b.id, "REJECTED", "غير متاحة ذلك اليوم");
    expect(await bookingRow(b.id)).toMatchObject({ status: "REJECTED", paymentStatus: "REFUNDED" });
  });

  it("an unanswered paid request expires and is refunded automatically", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    await simulateSandboxPayment(m.customer.actor, ref, { outcome: "approve", cardNumber: SANDBOX_CARDS.approve });
    await expireStalePendingBookings(new Date(Date.now() + 3 * 3600_000));
    expect(await bookingRow(b.id)).toMatchObject({ status: "CANCELLED", cancelReason: "acceptance_timeout", paymentStatus: "REFUNDED" });
  });
});

describe("sandbox payments — webhook safety", () => {
  const event = (ref: string, status: string, eventId = "evt_fixed_1") => {
    const raw = JSON.stringify({ eventId, providerRef: ref, status });
    return { raw, headers: { [SANDBOX_SIGNATURE_HEADER]: signSandboxEvent(raw) } };
  };

  it("a repeated event is processed once (idempotent)", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    const e = event(ref, "PAID");
    expect(await handleGatewayEvent("sandbox", e.raw, e.headers)).toMatchObject({ duplicate: false });
    expect(await handleGatewayEvent("sandbox", e.raw, e.headers)).toMatchObject({ duplicate: true });
    expect(await db.paymentEvent.count()).toBe(1);
    expect((await bookingRow(b.id)).history.filter((h) => h.to === "PENDING_PROVIDER_ACCEPTANCE")).toHaveLength(1);
  });

  it("a forged or tampered event is rejected", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    const e = event(ref, "PAID");
    await expect(handleGatewayEvent("sandbox", e.raw, { [SANDBOX_SIGNATURE_HEADER]: "00".repeat(32) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const tampered = e.raw.replace("PAID", "FAILED");
    await expect(handleGatewayEvent("sandbox", tampered, e.headers)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(handleGatewayEvent("unknown-gateway", e.raw, e.headers)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await bookingRow(b.id)).paymentStatus).toBe("PENDING");
  });

  it("payment window expiry cancels the hold; money arriving afterwards is refunded", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    await expireStalePendingBookings(new Date(Date.now() + 20 * 60_000)); // default window 15 min
    expect(await bookingRow(b.id)).toMatchObject({ status: "CANCELLED", cancelReason: "payment_timeout", paymentStatus: "VOIDED" });
    // The gateway reports the money was taken after all: the booking stays cancelled and the money goes back.
    const late = event(ref, "PAID", "evt_late");
    await handleGatewayEvent("sandbox", late.raw, late.headers);
    const row = await bookingRow(b.id);
    expect(row).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(await db.refund.findFirst({ where: { paymentId: row.payments[0].id } })).toMatchObject({ status: "SUCCEEDED", reason: "paid_after_close" });
  });

  it("refunds are idempotent", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    await simulateSandboxPayment(m.customer.actor, ref, { outcome: "approve", cardNumber: SANDBOX_CARDS.approve });
    await refundBookingPayment(b.id, "manual");
    await refundBookingPayment(b.id, "manual again");
    expect(await db.refund.count()).toBe(1);
  });

  it("only the booking's customer can open or pay its checkout", async () => {
    const m = await marketplace();
    const { b, ref } = await onlineBooking(m);
    const other = await signIn();
    await expect(startCheckout(other.actor, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(simulateSandboxPayment(other.actor, ref, { outcome: "approve", cardNumber: SANDBOX_CARDS.approve })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await getBooking(m.customer.actor, b.id)).canPay).toBe(true);
  });
});

describe("sandbox SMS and production guards", () => {
  it("the sandbox SMS provider stores messages and the inbox is readable only when enabled", async () => {
    await new SandboxSmsProvider().send("+966500000999", "رمز الدخول: 123456");
    expect(await listSandboxSms()).toBeNull(); // test env uses SMS_PROVIDER=memory → inbox disabled
    const prev = process.env.SMS_PROVIDER;
    process.env.SMS_PROVIDER = "sandbox";
    resetEnvCache();
    try {
      const msgs = await listSandboxSms("+966500000999");
      expect(msgs?.[0]).toMatchObject({ to: "+966500000999", provider: "sandbox" });
    } finally {
      process.env.SMS_PROVIDER = prev;
      resetEnvCache();
    }
  });

  it("production refuses sandbox payments and sandbox SMS", () => {
    const base = { APP_ENV: "production", DATABASE_URL: "postgresql://u:p@h:5432/prod", AUTH_SECRET: "x".repeat(40) };
    const r = parseEnv({ ...base, SMS_PROVIDER: "sandbox", PAYMENT_MODE: "sandbox" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["SMS_PROVIDER", "PAYMENT_MODE"]));
  });
});
