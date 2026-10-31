// Shared E2E harness: isolated test DB, a real `next start` server, OTP read from the server log.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
export const { chromium } = require("playwright");

export const testEnv = config({ path: ".env.test", override: true }).parsed;
if (testEnv.APP_ENV !== "test" || !/test/i.test(new URL(testEnv.DATABASE_URL).pathname)) {
  throw new Error("E2E must run against the isolated test database");
}

export function createHarness(port) {
  const BASE = `http://localhost:${port}`;
  const serverEnv = { ...process.env, ...testEnv, SMS_PROVIDER: "console", PORT: String(port) };
  const db = new PrismaClient({ datasources: { db: { url: testEnv.DATABASE_URL } } });
  const results = [];
  let failed = false;
  let log = "";
  let server;

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
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  function start() {
    return new Promise((resolve, reject) => {
      server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
        env: serverEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timer = setTimeout(() => reject(new Error("server did not start in 60s")), 60_000);
      server.stdout.on("data", (d) => {
        log += d.toString();
        if (/Ready in|Local:/.test(d.toString())) {
          clearTimeout(timer);
          resolve();
        }
      });
      server.stderr.on("data", (d) => (log += d.toString()));
      server.on("exit", (code) => {
        clearTimeout(timer);
        if (code) reject(new Error(`server exited ${code}`));
      });
    });
  }
  async function stop() {
    if (!server) return;
    const done = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await done;
    server = undefined;
  }
  async function resetDb() {
    const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} RESTART IDENTITY CASCADE`);
  }
  async function waitForOtp(phone, after) {
    for (let i = 0; i < 50; i++) {
      const line = log.slice(after).split("\n").filter((l) => l.includes(`[DEV SMS — not delivered] to=${phone}`)).at(-1);
      const m = line?.match(/body=\D*(\d{6})/);
      if (m) return m[1];
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no OTP in server log for ${phone}`);
  }
  async function login(page, localPhone, e164) {
    await page.goto(`${BASE}/login`);
    const mark = log.length;
    await page.fill("#phone", localPhone);
    await page.click('[data-testid="phone-form"] button[type=submit]');
    await page.waitForURL(/step=code/);
    await page.fill("#code", await waitForOtp(e164, mark));
    await page.click('[data-testid="code-form"] button[type=submit]');
    await page.waitForURL(`${BASE}/account`);
  }
  /** Submit a form and wait for the server's success message inside it. */
  async function submit(form) {
    await form.locator("button[type=submit]").first().click();
    await form.locator('[role="status"], [role="alert"]').first().waitFor();
    const err = await form.locator('[role="alert"]').count();
    if (err) throw new Error(`form error: ${await form.locator('[role="alert"]').first().textContent()}`);
  }
  async function finish() {
    await stop();
    await db.$disconnect();
    console.log(`\nE2E results (${port})\n` + results.join("\n"));
    if (failed) {
      console.log("\n--- server log tail ---\n" + log.slice(-3000));
      process.exit(1);
    }
  }
  return { BASE, db, step, assert, start, stop, resetDb, login, submit, finish, getLog: () => log };
}
