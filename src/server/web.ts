import { cookies, headers } from "next/headers";
import { cache } from "react";
import { dict2 } from "@/i18n/p2";
import { dictionaries, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type AppLocale } from "@/i18n/dictionaries";
import { resolveSession, type CurrentUser } from "./auth/service";
import { AUTH_POLICY } from "./auth/policy";
import { isAppError } from "./errors";
import { logger } from "./logger";
import { env } from "./env";

/** Current user for this request (session re-validated against the database every request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(AUTH_POLICY.sessionCookie)?.value;
  return resolveSession(token);
});

/** Locale: signed-in user's saved preference, then cookie, then Arabic. */
export const getLocale = cache(async (): Promise<AppLocale> => {
  const user = await getCurrentUser();
  if (user) return user.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
});

export async function getDictionary() {
  return dictionaries[await getLocale()];
}

export async function getDict2() {
  return dict2[await getLocale()];
}

/**
 * Client IP for rate limiting. Uses the first X-Forwarded-For hop, which is only trustworthy
 * behind a proxy that overwrites the header (see docs/SECURITY_AND_PRIVACY.md).
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(AUTH_POLICY.sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_ENV === "production",
    path: "/",
    maxAge: Math.floor(AUTH_POLICY.sessionTtlMs / 1000),
  });
}

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

/** Runs a server action body, converting expected errors into a localized message. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  const dict = await getDictionary();
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: dict.errors[e.code] ?? dict.errors.UNKNOWN };
    logger.error("action.failed", { error: e });
    return { ok: false, error: dict.errors.UNKNOWN };
  }
}
