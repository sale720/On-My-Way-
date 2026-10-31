// Sandbox release E2E — exactly what a tester does in Codespaces:
// demo data → sign in by reading the code in the in-app sandbox SMS inbox → pay online through the
// sandbox gateway → provider accepts → customer cancels → automatic refund. Plus a declined payment.
import { execFileSync } from "node:child_process";
import { chromium, createHarness, testEnv } from "./lib.mjs";

const SANDBOX = { SMS_PROVIDER: "sandbox", PAYMENT_MODE: "sandbox" };
const h = createHarness(3103, SANDBOX);
const { BASE, db, step, assert } = h;
let browser;

/** Sign in using only the UI: request a code, read it from /dev/sms, enter it. */
async function loginViaInbox(ctx, local, e164) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#phone", local);
  await page.click('[data-testid="phone-form"] button[type=submit]');
  await page.waitForURL(/step=code/);
  const inbox = await ctx.newPage();
  await inbox.goto(`${BASE}/dev/sms?phone=${encodeURIComponent(local)}`);
  const body = await inbox.locator('[data-testid="sandbox-sms"] li').first().textContent();
  const code = body.match(/\b\d{6}\b(?![\d])/g)?.find((c) => !e164.includes(c));
  await inbox.close();
  assert(code, `no code in inbox: ${body}`);
  await page.fill("#code", code);
  await page.click('[data-testid="code-form"] button[type=submit]');
  await page.waitForURL(`${BASE}/account`);
  return page;
}
async function act(p, to, reason) {
  const f = p.locator(`[data-testid="act-${to}"]`);
  if (reason) await f.locator("input[name=reason]").fill(reason);
  await f.locator("button[type=submit]").click();
  await p.waitForSelector(`[data-testid="booking-status"][data-status="${to}"]`);
}
async function bookToConfirm(page, dayIndex) {
  await page.goto(`${BASE}/book`);
  await page.locator('[data-testid="search-form"] select[name=categoryId]').selectOption({ label: "الشعر" });
  await page.click('[data-testid="search-form"] button');
  await page.waitForSelector('[data-testid="offer"]');
  await page.locator('[data-testid="offer"] a').first().click();
  await page.waitForSelector('[data-testid="days"] a');
  await page.locator('[data-testid="days"] a').nth(dayIndex).click();
  await page.waitForSelector('[data-testid="slots"] a');
  await page.locator('[data-testid="slots"] a').first().click();
  await page.waitForURL(/confirm/);
}

try {
  await h.resetDb();
  execFileSync("npx", ["tsx", "scripts/demo-seed.ts"], { env: { ...process.env, ...testEnv, ...SANDBOX }, stdio: "pipe" });
  await h.start();
  browser = await chromium.launch();
  const custCtx = await browser.newContext();
  let customer;

  await step("demo data is present and the sandbox SMS inbox is clearly labelled", async () => {
    assert((await db.user.count()) === 5 && (await db.salonService.count()) === 4, "demo seed missing");
    const p = await custCtx.newPage();
    await p.goto(`${BASE}/dev/sms`);
    assert((await p.textContent('[role="note"]')).includes("لم تُرسل"), "inbox not labelled as sandbox");
    await p.close();
  });

  await step("customer signs in using only the UI and the sandbox inbox", async () => {
    customer = await loginViaInbox(custCtx, "0500000005", "+966500000005");
    assert((await customer.textContent('[data-testid="account-phone"]')).includes("+966500000005"), "wrong account");
  });

  await step("an uncovered address shows the explained exclusion", async () => {
    await customer.goto(`${BASE}/book`);
    await customer.locator('[data-testid="search-form"] select[name=addressId]').selectOption({ index: 1 }); // بيت الأهل — العليا
    await customer.locator('[data-testid="search-form"] select[name=categoryId]').selectOption({ label: "الشعر" });
    await customer.click('[data-testid="search-form"] button');
    await customer.waitForSelector('[data-testid="excluded"]');
    assert((await customer.textContent('[data-testid="excluded"]')).includes("خارج نطاق المنشأة"), "reason not shown");
    assert((await customer.locator('[data-testid="offer"]').count()) === 0, "uncovered address got offers");
  });

  let bookingUrl = "";
  await step("checkout lists online methods as SANDBOX; paying with mada test card succeeds", async () => {
    await bookToConfirm(customer, 3); // three days ahead → inside the free-cancellation window
    const mada = customer.locator('[data-testid="payment-methods"] label[data-method="MADA"]');
    assert((await mada.getAttribute("data-state")) === "SANDBOX", "mada not sandbox");
    await mada.locator("input").check();
    await customer.locator('[data-testid="confirm-form"] button[type=submit]').click();
    await customer.waitForURL(/\/pay\/sandbox\//);
    assert((await customer.textContent('[role="note"]')).includes("تجريبية"), "checkout not labelled sandbox");
    await customer.fill('[data-testid="sandbox-card-form"] input[name=cardNumber]', "4111 1111 1111 1111");
    await customer.click('[data-testid="sandbox-card-form"] button[type=submit]');
    await customer.waitForURL(/\/bookings\//);
    bookingUrl = customer.url();
    assert((await customer.getAttribute('[data-testid="booking-status"]', "data-status")) === "PENDING_PROVIDER_ACCEPTANCE", "not sent to provider");
    assert((await customer.getAttribute('[data-testid="payment"]', "data-payment-status")) === "PAID", "not paid");
  });

  await step("the assigned provider signs in via the inbox and accepts", async () => {
    const b = await db.booking.findFirst({ include: { staff: { include: { user: true } } } });
    const phone = b.staff.user.phone;
    const provider = await loginViaInbox(await browser.newContext(), phone.replace("+966", "0"), phone);
    await provider.goto(bookingUrl);
    await act(provider, "CONFIRMED");
  });

  await step("customer cancels within the free window → refund shown and recorded", async () => {
    await customer.goto(bookingUrl);
    await act(customer, "CANCELLED", "تغيّر موعدي");
    await customer.reload();
    assert((await customer.getAttribute('[data-testid="refund"]', "data-refund-status")) === "SUCCEEDED", "refund not shown");
    const r = await db.refund.findFirst();
    assert(r?.status === "SUCCEEDED", "refund not in DB");
  });

  await step("a declined Apple Pay sandbox payment cancels the request", async () => {
    await bookToConfirm(customer, 4);
    await customer.locator('[data-testid="payment-methods"] label[data-method="APPLE_PAY"] input').check();
    await customer.locator('[data-testid="confirm-form"] button[type=submit]').click();
    await customer.waitForURL(/\/pay\/sandbox\//);
    await customer.click('[data-testid="sandbox-decline"] button[type=submit]');
    await customer.waitForURL(/\/bookings\//);
    assert((await customer.getAttribute('[data-testid="booking-status"]', "data-status")) === "CANCELLED", "not cancelled");
    assert((await customer.getAttribute('[data-testid="payment"]', "data-payment-status")) === "FAILED", "payment not failed");
  });
} catch {
  // recorded in results
} finally {
  await browser?.close();
  await h.finish();
}
