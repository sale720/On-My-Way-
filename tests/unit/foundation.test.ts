import { describe, expect, it } from "vitest";
import { normalizeSaudiMobile } from "@/server/auth/phone";
import { parseEnv } from "@/server/env";
import { __test__, maskPhone } from "@/server/logger";
import { PLATFORM_ROLE_PERMISSIONS, SALON_ROLE_PERMISSIONS, platformPermissionsFor } from "@/server/rbac/permissions";
import { AppError } from "@/server/errors";

describe("normalizeSaudiMobile", () => {
  it.each([
    ["0512345678", "+966512345678"],
    ["512345678", "+966512345678"],
    ["966512345678", "+966512345678"],
    ["+966 51 234 5678", "+966512345678"],
    ["00966512345678", "+966512345678"],
    ["٠٥١٢٣٤٥٦٧٨", "+966512345678"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeSaudiMobile(input)).toBe(expected);
  });

  it.each(["0412345678", "05123", "+971512345678", "abc", ""])("rejects %s", (input) => {
    expect(() => normalizeSaudiMobile(input)).toThrow(AppError);
  });
});

describe("environment validation", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/omw_dev",
    AUTH_SECRET: "x".repeat(32),
    SMS_PROVIDER: "console",
  };
  it("accepts a valid development config", () => {
    expect(parseEnv({ ...base, APP_ENV: "development" }).success).toBe(true);
  });
  it("rejects short secrets", () => {
    expect(parseEnv({ ...base, APP_ENV: "development", AUTH_SECRET: "short" }).success).toBe(false);
  });
  it("refuses production with a dev-only SMS provider", () => {
    expect(parseEnv({ ...base, APP_ENV: "production" }).success).toBe(false);
  });
  it("refuses APP_ENV=test against a non-test database", () => {
    expect(parseEnv({ ...base, APP_ENV: "test" }).success).toBe(false);
  });
});

describe("logger redaction", () => {
  it("redacts secrets and masks phones", () => {
    const out = __test__.redact({ code: "123456", token: "abc", phone: "+966512345678", nested: { otp: "1" } }) as Record<
      string,
      unknown
    >;
    expect(out.code).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.phone).toBe(maskPhone("+966512345678"));
    expect((out.nested as Record<string, unknown>).otp).toBe("[REDACTED]");
  });
});

describe("permission matrix", () => {
  it("customers cannot administer the platform", () => {
    const p = platformPermissionsFor(["CUSTOMER"]);
    expect(p.has("platform.users.read")).toBe(false);
    expect(p.has("salon.create")).toBe(true);
  });
  it("support agents can read but not manage", () => {
    const p = platformPermissionsFor(["SUPPORT_AGENT"]);
    expect(p.has("platform.users.read")).toBe(true);
    expect(p.has("platform.users.manage")).toBe(false);
    expect(p.has("platform.roles.manage")).toBe(false);
  });
  it("only platform admins may manage roles", () => {
    const holders = Object.entries(PLATFORM_ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes("platform.roles.manage"))
      .map(([r]) => r);
    expect(holders).toEqual(["PLATFORM_ADMIN"]);
  });
  it("staff cannot read or manage salon members", () => {
    expect(SALON_ROLE_PERMISSIONS.STAFF).not.toContain("salon.members.read");
    expect(SALON_ROLE_PERMISSIONS.STAFF).not.toContain("salon.members.manage");
  });
});
