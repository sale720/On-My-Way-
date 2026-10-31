// Phase 2 end-to-end: the whole marketplace set up and used through the real UI.
import { execFileSync } from "node:child_process";
import { chromium, createHarness, testEnv } from "./lib.mjs";

// Runs with PAYMENT_MODE=off: verifies that without sandbox mode online methods are visible but never usable.
const h = createHarness(3102, { PAYMENT_MODE: "off" });
const { BASE, db, step, assert, login, submit } = h;
const U = {
  admin: ["0500000201", "+966500000201"],
  owner: ["0500000202", "+966500000202"],
  provider: ["0500000203", "+966500000203"],
  customer: ["0500000204", "+966500000204"],
  stranger: ["0500000205", "+966500000205"],
};
let browser;
/** Perform a booking transition and wait until the page shows the new status. */
async function act(p, to) {
  await p.locator(`[data-testid="act-${to}"] button[type=submit]`).click();
  await p.waitForSelector(`[data-testid="booking-status"][data-status="${to}"]`);
}

try {
  await h.resetDb();
  await h.start();
  browser = await chromium.launch();
  const page = async (who) => {
    const p = await (await browser.newContext()).newPage();
    await login(p, ...U[who]);
    return p;
  };

  const admin = await page("admin");
  execFileSync("npx", ["tsx", "scripts/grant-admin.ts", U.admin[0], "e2e operator"], { env: { ...process.env, ...testEnv }, stdio: "pipe" });

  await step("admin adds a city, two districts and a category from the admin panel", async () => {
    await admin.goto(`${BASE}/admin/catalog`);
    const city = admin.locator('[data-testid="city-form"]');
    await city.locator("[name=nameAr]").fill("الرياض");
    await city.locator("[name=nameEn]").fill("Riyadh");
    await submit(city);
    for (const [ar, en] of [["الملقا", "Al Malqa"], ["العزيزية", "Al Aziziyah"]]) {
      await admin.reload();
      const d = admin.locator('[data-testid="district-form"]');
      await d.locator("[name=nameAr]").fill(ar);
      await d.locator("[name=nameEn]").fill(en);
      await submit(d);
    }
    const cat = admin.locator('[data-testid="category-form"]');
    await cat.locator("[name=nameAr]").fill("الشعر");
    await cat.locator("[name=nameEn]").fill("Hair");
    await cat.locator("[name=slug]").fill("hair");
    await submit(cat);
    assert((await db.district.count()) === 2 && (await db.serviceCategory.count()) === 1, "catalog not saved");
  });

  const owner = await page("owner");
  let salonId = "";
  await step("owner creates a salon; admin approves it", async () => {
    await owner.fill('[data-testid="create-salon-form"] input[name=name]', "صالون النخبة");
    await owner.click('[data-testid="create-salon-form"] button[type=submit]');
    await owner.waitForURL(/\/salons\//);
    salonId = owner.url().split("/salons/")[1];
    await admin.goto(`${BASE}/admin`);
    const row = admin.locator('[data-testid="salons"] tr', { hasText: "صالون النخبة" });
    await row.locator("select[name=status]").selectOption("ACTIVE");
    await row.locator("input[name=reason]").fill("السجل التجاري موثّق");
    await submit(row.locator("form"));
    assert((await db.salon.findUnique({ where: { id: salonId } })).status === "ACTIVE", "salon not active");
  });

  await step("owner sets coverage (with travel fee) and adds a service", async () => {
    await owner.goto(`${BASE}/salons/${salonId}/coverage`);
    const cov = owner.locator('[data-testid="coverage-form"]');
    await cov.locator("select[name=districtId]").selectOption({ label: "الرياض — الملقا" });
    await cov.locator("[name=travelFeeSar]").fill("25");
    await submit(cov);
    await owner.goto(`${BASE}/salons/${salonId}/services`);
    const svc = owner.locator('[data-testid="service-form"]');
    await svc.locator("[name=nameAr]").fill("قص وتصفيف");
    await svc.locator("[name=nameEn]").fill("Cut & style");
    await svc.locator("[name=durationMinutes]").fill("60");
    await svc.locator("[name=priceSar]").fill("150");
    await submit(svc);
    const s = await db.salonService.findFirst({ where: { salonId } });
    assert(s?.priceHalalas === 15000, "service price not stored in halalas");
  });

  const provider = await page("provider");
  let membershipId = "";
  await step("owner adds the provider; she sets her skills, districts and weekly schedule", async () => {
    await owner.goto(`${BASE}/salons/${salonId}`);
    const add = owner.locator('[data-testid="add-member-form"]');
    await add.locator("[name=phone]").fill(U.provider[0]);
    await submit(add);
    membershipId = (await db.salonMembership.findFirst({ where: { salonId, role: "STAFF" } })).id;
    await provider.goto(`${BASE}/salons/${salonId}/staff/${membershipId}`);
    await provider.locator('[data-testid="skills-form"] input[name=serviceIds]').first().check();
    await submit(provider.locator('[data-testid="skills-form"]'));
    await provider.locator('[data-testid="staff-coverage-form"] input[name=districtIds]').first().check();
    await submit(provider.locator('[data-testid="staff-coverage-form"]'));
    const sch = provider.locator('[data-testid="schedule-form"]');
    for (let d = 0; d < 7; d++) {
      await sch.locator(`[name=from${d}]`).fill("08:00");
      await sch.locator(`[name=to${d}]`).fill("22:00");
    }
    await submit(sch);
    assert((await db.availabilityRule.count({ where: { membershipId } })) === 7, "schedule not saved");
  });

  const customer = await page("customer");
  let bookingUrl = "";
  await step("customer adds an address, searches, sees the price breakdown and picks a slot", async () => {
    await customer.goto(`${BASE}/addresses`);
    const f = customer.locator('[data-testid="address-form"]');
    await f.locator("select[name=districtId]").selectOption({ label: "الرياض — الملقا" });
    await f.locator("[name=street]").fill("شارع الأمير 12");
    await f.locator("[name=building]").fill("7");
    await submit(f);
    await customer.goto(`${BASE}/book`);
    await customer.click('[data-testid="search-form"] button');
    await customer.waitForSelector('[data-testid="offer"]');
    const offer = await customer.locator('[data-testid="offer"]').first().textContent();
    assert(offer.includes("صالون النخبة") && /175/.test(offer.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))), `offer text: ${offer}`);
    await customer.locator('[data-testid="offer"] a').first().click();
    await customer.waitForSelector('[data-testid="slots"] a');
    await customer.locator('[data-testid="slots"] a').first().click();
    await customer.waitForURL(/confirm/);
  });

  await step("checkout shows all 7 payment methods; only cash is selectable, the rest say why", async () => {
    const rows = customer.locator('[data-testid="payment-methods"] label');
    assert((await rows.count()) === 7, `methods shown: ${await rows.count()}`);
    const states = await rows.evaluateAll((els) => els.map((e) => [e.dataset.method, e.dataset.state, e.querySelector("input").disabled]));
    assert(JSON.stringify(states[0]) === JSON.stringify(["CASH", "AVAILABLE", false]), `cash: ${states[0]}`);
    assert(states.slice(1).every(([, s, dis]) => s === "NOT_INTEGRATED" && dis), `others: ${JSON.stringify(states)}`);
    await customer.locator('[data-testid="confirm-form"] button[type=submit]').click();
    await customer.waitForURL(/\/bookings\//);
    bookingUrl = customer.url();
    assert((await customer.getAttribute('[data-testid="booking-status"]', "data-status")) === "PENDING_PROVIDER_ACCEPTANCE", "status");
    const b = await db.booking.findFirst({ include: { payments: true } });
    assert(b.totalHalalas === 17500 && b.paymentMethod === "CASH" && b.payments[0].status === "PENDING", "db booking");
  });

  await step("provider sees the district only, accepts, then sees the full address", async () => {
    await provider.goto(bookingUrl);
    const before = await provider.textContent('[data-testid="booking-address"]');
    assert(before.includes("الملقا") && !before.includes("شارع الأمير"), `address leaked: ${before}`);
    await act(provider, "CONFIRMED");
    assert((await provider.textContent('[data-testid="booking-address"]')).includes("شارع الأمير 12"), "address not shown after confirm");
  });

  await step("provider runs the visit to completion and records the cash payment", async () => {
    for (const to of ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS", "COMPLETED"]) await act(provider, to);
    await provider.locator('[data-testid="record-cash"] button[type=submit]').click();
    await provider.waitForFunction(() => !document.querySelector('[data-testid="record-cash"]'));
    const b = await db.booking.findFirst({ include: { payments: true, history: true } });
    assert(b.status === "COMPLETED" && b.paymentStatus === "PAID" && b.payments[0].status === "PAID", "not completed/paid");
    assert(b.history.length === 6, `history ${b.history.length}`);
  });

  await step("customer was notified at each step and leaves a review", async () => {
    await customer.goto(`${BASE}/notifications`);
    assert((await customer.locator('[data-testid="notifications"] li').count()) >= 5, "notifications missing");
    await customer.goto(bookingUrl);
    const f = customer.locator('[data-testid="review-form"]');
    await f.locator("[name=comment]").fill("خدمة ممتازة وفي الوقت");
    await f.locator("button[type=submit]").click();
    await customer.waitForSelector('[data-testid="review"]');
    assert((await db.review.findFirst())?.rating === 5, "review not saved");
  });

  await step("another customer cannot open the booking", async () => {
    const stranger = await page("stranger");
    const r = await stranger.goto(bookingUrl);
    assert(r.status() === 404, `status ${r.status()}`);
  });

  await step("admin sees all payment methods (cash switchable, others pending integration) and the live report", async () => {
    await admin.goto(`${BASE}/admin/settings`);
    const rows = admin.locator('[data-testid="platform-payment-methods"] tbody tr');
    assert((await rows.count()) === 7, "platform methods count");
    assert((await rows.locator("form").count()) === 1, "only cash should have a switch");
    await admin.goto(`${BASE}/admin/report`);
    const report = (await admin.textContent('[data-testid="report"]')).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    assert(/175/.test(report), `report: ${report}`);
  });
} catch {
  // recorded in results
} finally {
  await browser?.close();
  await h.finish();
}
