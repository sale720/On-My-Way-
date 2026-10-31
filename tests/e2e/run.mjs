// End-to-end acceptance run for Phase 1 against a real `next start` server and the isolated test DB.
// Usage: npm run build && npm run test:e2e
// The OTP is read from the server log (SMS_PROVIDER=console), exactly as a developer would locally.
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = await import("playwright"));
}

const testEnv = config({ path: ".env.test", override: true }).parsed;
if (testEnv.APP_ENV !== "test" || !/test/i.test(new URL(testEnv.DATABASE_URL).pathname)) {
  throw new Error("E2E must run against the isolated test database");
}
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const serverEnv = { ...process.env, ...testEnv, SMS_PROVIDER: "console", PORT: String(PORT) };

const results = [];
let failed = false;
async function step(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (e) {
    failed = true;
    results.push(`FAIL  ${name}\n      ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    throw e;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let logBuffer = "";
let server;
function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
      env: serverEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const onData = (d) => {
      logBuffer += d.toString();
      if (/Ready in|started server|Local:/.test(d.toString())) resolve();
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", (d) => (logBuffer += d.toString()));
    server.on("exit", (code) => code && reject(new Error(`server exited ${code}`)));
    setTimeout(() => reject(new Error("server did not start in 60s")), 60_000);
  });
}
async function stopServer() {
  if (!server) return;
  const done = new Promise((r) => server.once("exit", r));
  server.kill("SIGTERM");
  await done;
  server = undefined;
}
async function waitForOtp(phone, after) {
  for (let i = 0; i < 50; i++) {
    const lines = logBuffer.slice(after).split("\n").filter((l) => l.includes(`[DEV SMS — not delivered] to=${phone}`));
    const m = lines.at(-1)?.match(/body=\D*(\d{6})/);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no OTP in server log for ${phone}`);
}
async function login(page, localPhone, e164) {
  await page.goto(`${BASE}/login`);
  const mark = logBuffer.length;
  await page.fill("#phone", localPhone);
  await page.click('[data-testid="phone-form"] button[type=submit]');
  await page.waitForURL(/step=code/);
  const code = await waitForOtp(e164, mark);
  await page.fill("#code", code);
  await page.click('[data-testid="code-form"] button[type=submit]');
  await page.waitForURL(`${BASE}/account`);
}

const db = new PrismaClient({ datasources: { db: { url: testEnv.DATABASE_URL } } });
await db.$executeRawUnsafe(
  'TRUNCATE "AuditLog","SalonMembership","Salon","Session","OtpChallenge","PlatformRoleAssignment","User" RESTART IDENTITY CASCADE',
);

const A = { local: "0500000101", e164: "+966500000101" };
const B = { local: "0500000102", e164: "+966500000102" };
let browser;
let salonUrl = "";

try {
  await startServer();
  browser = await chromium.launch();
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  await step("home renders in Arabic, RTL by default", async () => {
    await pageA.goto(BASE);
    assert((await pageA.getAttribute("html", "lang")) === "ar", "lang != ar");
    assert((await pageA.getAttribute("html", "dir")) === "rtl", "dir != rtl");
  });

  await step("user A signs up via OTP and lands on /account", async () => {
    await login(pageA, A.local, A.e164);
    assert((await pageA.textContent('[data-testid="account-phone"]'))?.includes(A.e164), "phone not shown");
  });

  await step("an invalid OTP is rejected with a visible error", async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill("#phone", "0500000199");
    await p.click('[data-testid="phone-form"] button[type=submit]');
    await p.waitForURL(/step=code/);
    await p.fill("#code", "000000");
    await p.click('[data-testid="code-form"] button[type=submit]');
    await p.waitForSelector('[data-testid="code-form"] [role="alert"]');
    assert(p.url().includes("/login"), "should stay on login");
    await ctx.close();
  });

  await step("profile name is saved to the database", async () => {
    await pageA.fill('[data-testid="profile-form"] input[name=name]', "سارة");
    await pageA.click('[data-testid="profile-form"] button[type=submit]');
    await pageA.waitForSelector('[data-testid="profile-form"] [role="status"]');
    const u = await db.user.findUnique({ where: { phone: A.e164 } });
    assert(u?.name === "سارة", `db name = ${u?.name}`);
  });

  await step("user A creates a salon and becomes OWNER", async () => {
    await pageA.fill('[data-testid="create-salon-form"] input[name=name]', "صالون الاختبار");
    await pageA.click('[data-testid="create-salon-form"] button[type=submit]');
    await pageA.waitForURL(/\/salons\//);
    salonUrl = pageA.url();
    assert((await pageA.textContent('[data-testid="salon-name"]')) === "صالون الاختبار", "salon name");
    const m = await db.salonMembership.findFirst({ where: { user: { phone: A.e164 } } });
    assert(m?.role === "OWNER", "membership role");
  });

  await step("switching language flips to English/LTR and persists as the user's preference", async () => {
    await pageA.click('[data-testid="switch-locale"]');
    await pageA.waitForFunction(() => document.documentElement.lang === "en");
    await pageA.reload();
    assert((await pageA.getAttribute("html", "dir")) === "ltr", "dir != ltr after reload");
    assert((await db.user.findUnique({ where: { phone: A.e164 } }))?.locale === "en", "locale not saved");
  });

  await step("data and session survive a full server restart", async () => {
    await stopServer();
    await startServer();
    await pageA.goto(`${BASE}/account`);
    assert(pageA.url().endsWith("/account"), "was logged out by restart");
    assert((await pageA.textContent('[data-testid="my-salons"]'))?.includes("صالون الاختبار"), "salon missing after restart");
    assert((await pageA.inputValue('[data-testid="profile-form"] input[name=name]')) === "سارة", "name missing after restart");
  });

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  await step("user B (other tenant) cannot open user A's salon or the admin page", async () => {
    await login(pageB, B.local, B.e164);
    const r1 = await pageB.goto(salonUrl);
    assert(r1?.status() === 404, `salon status ${r1?.status()}`);
    const r2 = await pageB.goto(`${BASE}/admin`);
    assert(r2?.status() === 404, `admin status ${r2?.status()}`);
  });

  await step("operator CLI grants PLATFORM_ADMIN to B (audited)", async () => {
    execFileSync("npx", ["tsx", "scripts/grant-admin.ts", B.local, "e2e bootstrap operator"], {
      env: { ...process.env, ...testEnv },
      stdio: "pipe",
    });
    const log = await db.auditLog.findFirst({ where: { action: "role.granted", actorId: null } });
    assert(log, "no audit entry");
  });

  await step("admin B suspends A with a reason; A's session is revoked immediately", async () => {
    await pageB.goto(`${BASE}/admin`);
    const row = pageB.locator('[data-testid="users"] tr', { hasText: A.e164 });
    await row.locator("input[name=reason]").first().fill("e2e suspension check");
    await row.locator("button[type=submit]").first().click();
    await row.locator('[role="status"]').first().waitFor();
    assert((await db.user.findUnique({ where: { phone: A.e164 } }))?.status === "SUSPENDED", "not suspended in db");
    await pageA.goto(`${BASE}/account`);
    assert(pageA.url().includes("/login"), "suspended user still signed in");
    const audit = await db.auditLog.findFirst({ where: { action: "user.suspended", reason: "e2e suspension check" } });
    assert(audit, "suspension not audited");
  });

  await step("logout revokes the session server-side", async () => {
    const cookie = (await ctxB.cookies()).find((c) => c.name === "omw_session");
    await pageB.goto(`${BASE}/account`);
    await pageB.click('[data-testid="logout"]');
    await pageB.waitForURL(`${BASE}/`);
    // Replaying the old cookie must not work.
    const ctxReplay = await browser.newContext();
    await ctxReplay.addCookies([{ ...cookie }]);
    const p = await ctxReplay.newPage();
    await p.goto(`${BASE}/account`);
    assert(p.url().includes("/login"), "revoked cookie still accepted");
    await ctxReplay.close();
  });

  await step("secrets are not written to the server log in clear text", async () => {
    // OTPs appear only on the explicit DEV SMS line; structured logs must not contain session tokens.
    const cookieLeak = /omw_session=|"token":"[A-Za-z0-9_-]{20,}"/.test(logBuffer);
    assert(!cookieLeak, "token found in logs");
  });
} catch {
  // recorded in results
} finally {
  await browser?.close();
  await stopServer();
  await db.$disconnect();
  console.log("\nE2E results\n" + results.join("\n"));
  if (failed) {
    console.log("\n--- server log tail ---\n" + logBuffer.slice(-3000));
    process.exit(1);
  }
}
