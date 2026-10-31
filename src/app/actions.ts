"use server";

import type { MembershipStatus, PlatformRole, SalonRole, SalonStatus, UserStatus } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE } from "@/i18n/dictionaries";
import { requestOtp, revokeSession, verifyOtp } from "@/server/auth/service";
import { AUTH_POLICY } from "@/server/auth/policy";
import { normalizeSaudiMobile } from "@/server/auth/phone";
import { addMember, createSalon, renameSalon, setSalonStatus, updateMember } from "@/server/salons/service";
import { grantRole, revokeRole, setUserStatus, updateProfile } from "@/server/users/service";
import { clientIp, getCurrentUser, getDictionary, getLocale, runAction, setSessionCookie, type ActionState } from "@/server/web";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function requestOtpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let phone = "";
  const res = await runAction(async () => {
    phone = normalizeSaudiMobile(str(fd, "phone"));
    await requestOtp({ phone, ip: await clientIp(), locale: await getLocale() });
  });
  if (res?.ok) redirect(`/login?step=code&phone=${encodeURIComponent(phone)}`);
  return res;
}

export async function verifyOtpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const { token } = await verifyOtp({
      phone: str(fd, "phone"),
      code: str(fd, "code"),
      userAgent: (await headers()).get("user-agent"),
    });
    await setSessionCookie(token);
  });
  if (res?.ok) redirect("/account");
  return res;
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(AUTH_POLICY.sessionCookie)?.value;
  if (token) await revokeSession(token);
  jar.delete(AUTH_POLICY.sessionCookie);
  redirect("/");
}

export async function setLocaleAction(fd: FormData) {
  const locale = str(fd, "locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 365 * 24 * 3600 });
  const user = await getCurrentUser();
  if (user) await updateProfile(user, { locale });
  revalidatePath("/", "layout");
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const dict = await getDictionary();
  return runAction(async () => {
    await updateProfile(await getCurrentUser(), { name: str(fd, "name") });
    revalidatePath("/account");
    return dict.account.saved;
  });
}

export async function createSalonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => {
    id = (await createSalon(await getCurrentUser(), { name: str(fd, "name") })).id;
  });
  if (res?.ok) redirect(`/salons/${id}`);
  return res;
}

export async function renameSalonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const dict = await getDictionary();
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    await renameSalon(await getCurrentUser(), salonId, str(fd, "name"));
    revalidatePath(`/salons/${salonId}`);
    return dict.account.saved;
  });
}

export async function addMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const dict = await getDictionary();
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    await addMember(await getCurrentUser(), salonId, { phone: str(fd, "phone"), role: str(fd, "role") as SalonRole });
    revalidatePath(`/salons/${salonId}`);
    return dict.account.saved;
  });
}

export async function updateMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const dict = await getDictionary();
  return runAction(async () => {
    const salonId = str(fd, "salonId");
    const role = str(fd, "role") || undefined;
    const status = str(fd, "status") || undefined;
    await updateMember(await getCurrentUser(), salonId, str(fd, "membershipId"), {
      role: role as SalonRole | undefined,
      status: status as MembershipStatus | undefined,
    });
    revalidatePath(`/salons/${salonId}`);
    return dict.account.saved;
  });
}

export async function setUserStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const dict = await getDictionary();
  return runAction(async () => {
    await setUserStatus(await getCurrentUser(), str(fd, "userId"), str(fd, "status") as UserStatus, str(fd, "reason"));
    revalidatePath("/admin");
    return dict.account.saved;
  });
}

export async function changeRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const dict = await getDictionary();
  return runAction(async () => {
    const actor = await getCurrentUser();
    const role = str(fd, "role") as PlatformRole;
    if (str(fd, "op") === "revoke") await revokeRole(actor, str(fd, "userId"), role, str(fd, "reason"));
    else await grantRole(actor, str(fd, "userId"), role, str(fd, "reason"));
    revalidatePath("/admin");
    return dict.account.saved;
  });
}

export async function setSalonStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const dict = await getDictionary();
  return runAction(async () => {
    await setSalonStatus(await getCurrentUser(), str(fd, "salonId"), str(fd, "status") as SalonStatus, str(fd, "reason"));
    revalidatePath("/admin");
    return dict.account.saved;
  });
}
