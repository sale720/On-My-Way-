"use server";

import type { BookingStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAddress, createCity, createDistrict, deleteAddress, setStaffCoverage, upsertSalonCoverage } from "@/server/geo/service";
import { createCategory, createSalonService, setCategoryActive, setStaffSkills, updateSalonService } from "@/server/catalog/service";
import { addException, removeException, setWeeklyRules } from "@/server/availability/service";
import { createBooking, recordCashPayment, transitionBooking } from "@/server/bookings/service";
import { simulateSandboxPayment, startCheckout } from "@/server/payments/checkout";
import { createReview } from "@/server/reviews/service";
import { markAllRead } from "@/server/notifications/service";
import { setPlatformPaymentMethod, setSalonPaymentMethod } from "@/server/payments/service";
import { setSetting } from "@/server/settings/service";
import { updateSalonPolicy } from "@/server/salons/service";
import { hhmmToMinutes } from "@/server/time";
import { AppError } from "@/server/errors";
import { getCurrentUser, getDictionary, runAction, type ActionState } from "@/server/web";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const saved = async () => (await getDictionary()).account.saved;

// ── Customer ──
export async function createAddressAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let back = "";
  const res = await runAction(async () => {
    await createAddress(await getCurrentUser(), Object.fromEntries(["label", "districtId", "street", "building", "floor", "instructions"].map((k) => [k, str(fd, k)])));
    back = str(fd, "back");
    return saved();
  });
  if (res?.ok && back.startsWith("/")) redirect(back);
  revalidatePath("/addresses");
  return res;
}

export async function deleteAddressAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deleteAddress(await getCurrentUser(), str(fd, "addressId"));
    revalidatePath("/addresses");
    return saved();
  });
}

export async function createBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const res = await runAction(async () => {
    const user = await getCurrentUser();
    const b = await createBooking(user, {
      salonServiceId: str(fd, "salonServiceId"),
      addressId: str(fd, "addressId"),
      startsAt: str(fd, "startsAt"),
      paymentMethod: str(fd, "paymentMethod"),
      notes: str(fd, "notes"),
    });
    // Online methods continue to the (sandbox) hosted checkout; cash goes straight to the booking.
    target = b.status === "PENDING_PAYMENT" ? await startCheckout(user, b.id) : `/bookings/${b.id}`;
  });
  if (res?.ok) redirect(target);
  return res;
}

export async function startCheckoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const res = await runAction(async () => {
    target = await startCheckout(await getCurrentUser(), str(fd, "bookingId"));
  });
  if (res?.ok) redirect(target);
  return res;
}

export async function sandboxPayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let bookingId = "";
  const res = await runAction(async () => {
    const user = await getCurrentUser();
    const ref = str(fd, "providerRef");
    await simulateSandboxPayment(user, ref, {
      outcome: str(fd, "outcome") === "decline" ? "decline" : "approve",
      cardNumber: str(fd, "cardNumber") || undefined,
    });
    bookingId = str(fd, "bookingId");
  });
  if (res?.ok) redirect(`/bookings/${bookingId}`);
  return res;
}

export async function transitionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = str(fd, "bookingId");
    await transitionBooking(await getCurrentUser(), id, str(fd, "to") as BookingStatus, str(fd, "reason"));
    revalidatePath(`/bookings/${id}`);
    return saved();
  });
}

export async function recordCashAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = str(fd, "bookingId");
    await recordCashPayment(await getCurrentUser(), id);
    revalidatePath(`/bookings/${id}`);
    return saved();
  });
}

export async function reviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = str(fd, "bookingId");
    await createReview(await getCurrentUser(), id, {
      rating: str(fd, "rating"),
      punctuality: str(fd, "punctuality"),
      quality: str(fd, "quality"),
      comment: str(fd, "comment"),
    });
    revalidatePath(`/bookings/${id}`);
    return saved();
  });
}

export async function markNotificationsReadAction() {
  await markAllRead(await getCurrentUser());
  revalidatePath("/", "layout");
}

// ── Salon operations ──
export async function createServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    await createSalonService(await getCurrentUser(), salonId, Object.fromEntries(["categoryId", "nameAr", "nameEn", "descriptionAr", "descriptionEn", "durationMinutes", "priceSar"].map((k) => [k, str(fd, k)])));
    revalidatePath(`/salons/${salonId}/services`);
    return saved();
  });
}

export async function updateServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    const active = fd.get("active");
    await updateSalonService(await getCurrentUser(), salonId, str(fd, "serviceId"), {
      priceSar: fd.get("priceSar") ?? undefined,
      durationMinutes: fd.get("durationMinutes") ?? undefined,
      active: active === null ? undefined : active === "true",
    });
    revalidatePath(`/salons/${salonId}/services`);
    return saved();
  });
}

export async function coverageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    await upsertSalonCoverage(await getCurrentUser(), salonId, {
      districtId: str(fd, "districtId"),
      travelFeeSar: str(fd, "travelFeeSar"),
      active: str(fd, "active") !== "false",
    });
    revalidatePath(`/salons/${salonId}/coverage`);
    return saved();
  });
}

export async function staffSkillsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    const membershipId = str(fd, "membershipId");
    await setStaffSkills(await getCurrentUser(), salonId, membershipId, fd.getAll("serviceIds").map(String));
    revalidatePath(`/salons/${salonId}/staff/${membershipId}`);
    return saved();
  });
}

export async function staffCoverageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    const membershipId = str(fd, "membershipId");
    await setStaffCoverage(await getCurrentUser(), salonId, membershipId, fd.getAll("districtIds").map(String));
    revalidatePath(`/salons/${salonId}/staff/${membershipId}`);
    return saved();
  });
}

export async function scheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    const membershipId = str(fd, "membershipId");
    const rules = [];
    for (let d = 0; d < 7; d++) {
      const from = str(fd, `from${d}`);
      const to = str(fd, `to${d}`);
      if (!from && !to) continue;
      const startMinute = hhmmToMinutes(from);
      const endMinute = hhmmToMinutes(to);
      if (Number.isNaN(startMinute) || Number.isNaN(endMinute)) throw new AppError("VALIDATION", "time");
      rules.push({ weekday: d, startMinute, endMinute });
    }
    await setWeeklyRules(await getCurrentUser(), salonId, membershipId, rules);
    revalidatePath(`/salons/${salonId}/staff/${membershipId}`);
    return saved();
  });
}

export async function dayOffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    const membershipId = str(fd, "membershipId");
    const actor = await getCurrentUser();
    if (str(fd, "exceptionId")) await removeException(actor, salonId, membershipId, str(fd, "exceptionId"));
    else await addException(actor, salonId, membershipId, str(fd, "date"), str(fd, "reason"));
    revalidatePath(`/salons/${salonId}/staff/${membershipId}`);
    return saved();
  });
}

export async function salonPolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    await updateSalonPolicy(
      await getCurrentUser(),
      salonId,
      Object.fromEntries(["travelBufferMinutes", "minNoticeMinutes", "maxAdvanceDays", "cancellationWindowHours", "acceptanceTimeoutMinutes"].map((k) => [k, str(fd, k)])),
    );
    revalidatePath(`/salons/${salonId}/settings`);
    return saved();
  });
}

export async function salonPaymentMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    await setSalonPaymentMethod(await getCurrentUser(), salonId, str(fd, "method"), str(fd, "enabled") === "true");
    revalidatePath(`/salons/${salonId}/settings`);
    return saved();
  });
}

// ── Platform admin ──
export async function createCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await createCategory(await getCurrentUser(), { slug: str(fd, "slug"), nameAr: str(fd, "nameAr"), nameEn: str(fd, "nameEn"), sortOrder: Number(str(fd, "sortOrder") || 0) });
    revalidatePath("/admin/catalog");
    return saved();
  });
}

export async function categoryActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await setCategoryActive(await getCurrentUser(), str(fd, "categoryId"), str(fd, "active") === "true");
    revalidatePath("/admin/catalog");
    return saved();
  });
}

export async function createCityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await createCity(await getCurrentUser(), { nameAr: str(fd, "nameAr"), nameEn: str(fd, "nameEn") });
    revalidatePath("/admin/catalog");
    return saved();
  });
}

export async function createDistrictAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await createDistrict(await getCurrentUser(), { cityId: str(fd, "cityId"), nameAr: str(fd, "nameAr"), nameEn: str(fd, "nameEn") });
    revalidatePath("/admin/catalog");
    return saved();
  });
}

export async function platformSettingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const percent = Number(str(fd, "percent"));
    if (!Number.isFinite(percent)) throw new AppError("VALIDATION");
    await setSetting(await getCurrentUser(), str(fd, "key") as "commissionBps" | "vatBps", Math.round(percent * 100), str(fd, "reason"));
    revalidatePath("/admin/settings");
    return saved();
  });
}

export async function platformPaymentMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await setPlatformPaymentMethod(await getCurrentUser(), str(fd, "method"), str(fd, "enabled") === "true", str(fd, "reason"));
    revalidatePath("/admin/settings");
    return saved();
  });
}
