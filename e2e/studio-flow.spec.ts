import path from "node:path";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * The whole happy path, in order, in one browser session:
 *   sign in with a one-time code → create a boutique → upload a garment →
 *   generate two images → see them in the gallery → download one.
 * Each run uses a fresh email and boutique, so the e2e database can be reused between runs.
 */
test.describe.configure({ mode: "serial" });

const SAMPLE = path.join(__dirname, "..", "public", "samples", "sample-kurta.jpg");
const RUN = Date.now().toString(36);
const EMAIL = `e2e-${RUN}@example.com`;
const BOUTIQUE = `E2E Boutique ${RUN}`;

let context: BrowserContext;
let page: Page;
let garmentTitle = "";
let garmentId = "";

const credits = () => page.getByRole("link", { name: /^Credits/ });

/** Poll the dev-only route until the server has captured the sign-in code for this address. */
async function readLatestCode(email: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const res = await page.request.get(`/api/dev/last-otp?email=${encodeURIComponent(email)}`);
    lastStatus = res.status();
    if (res.ok()) {
      const body = (await res.json()) as { code: string };
      return body.code;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`No one-time code captured for ${email} (last status ${lastStatus}). Is the server running with E2E_TEST=1?`);
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  // Warm the dev server: the first compile of each route under `next dev` can take a while,
  // and it should not eat into the budget of the timed steps below.
  test.setTimeout(600_000);
  const otp = await page.request.get("/api/dev/last-otp?email=warmup%40example.com", { timeout: 300_000 });
  expect(otp.status(), "GET /api/dev/last-otp must answer (404 for an unknown address) when E2E_TEST=1").toBe(404);
  await page.goto("/sign-in", { timeout: 300_000 });
});

test.afterAll(async () => {
  await context?.close();
});

test("signs in with a one-time code", async () => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(EMAIL);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("Six-digit code")).toBeVisible();

  const code = await readLatestCode(EMAIL);
  expect(code).toMatch(/^\d{6}$/);

  await page.getByLabel("Six-digit code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();

  // A brand-new user has no boutique yet, so the studio hands over to onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Name your boutique" })).toBeVisible();
});

test("creates a boutique and lands in the studio with 100 credits", async () => {
  await page.getByLabel("Boutique name").fill(BOUTIQUE);
  await page.getByRole("button", { name: "Open my studio" }).click();

  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { level: 1, name: "Studio" })).toBeVisible();
  await expect(page.getByText(BOUTIQUE).first()).toBeVisible();
  await expect(credits()).toContainText("100");
});

test("uploads a garment and the photo is made automatically for 25 credits", async () => {
  // One tap: choosing a photo uploads it, checks it, and starts the run with the house defaults.
  await page.locator('input[aria-label="Choose photos"]').setInputFiles(SAMPLE);

  // The progress card names the garment once the run has started.
  const progressCard = page.locator("section").filter({ has: page.getByRole("progressbar", { name: "Progress" }) });
  await expect(progressCard.or(page.locator("section").filter({ has: page.getByRole("button", { name: "Make again" }) }))).toBeVisible({ timeout: 90_000 });

  // Both results render, the run finishes, and the shell refreshes the balance.
  const results = page.locator('img[alt*=", variation "]');
  await expect(results).toHaveCount(2, { timeout: 150_000 });
  await expect(page.getByRole("button", { name: "Make again" })).toBeVisible({ timeout: 60_000 });
  await expect(credits()).toContainText("75");

  garmentTitle = (await page.getByRole("heading", { level: 2 }).first().textContent())?.trim() ?? "";
  expect(garmentTitle.length).toBeGreaterThan(0);

  const galleryHref = await page.getByRole("link", { name: "gallery", exact: true }).getAttribute("href");
  garmentId = galleryHref?.split("/").pop() ?? "";
  expect(garmentId).toMatch(/^gar_/);
});

test("gallery lists the garment with 2 images and the download endpoint returns a JPEG", async () => {
  await page.goto("/gallery");
  const cardLink = page.locator(`a[href="/gallery/${garmentId}"]`);
  await expect(cardLink).toBeVisible();
  await expect(cardLink).toContainText(garmentTitle);
  await expect(cardLink).toContainText("2 images");

  await cardLink.click();
  await expect(page).toHaveURL(new RegExp(`/gallery/${garmentId}$`));
  await expect(page.getByRole("heading", { level: 1, name: garmentTitle })).toBeVisible();
  await expect(page.locator('img[alt*=", variation "]')).toHaveCount(2);
  await expect(page.getByText("Complete", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Download options" }).first().click();
  const downloadLink = page.getByRole("menu").locator('a[href^="/api/images/"]').first();
  await expect(downloadLink).toBeVisible();
  const href = await downloadLink.getAttribute("href");
  expect(href).toBeTruthy();
  await page.keyboard.press("Escape");

  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.body();
  expect(body.length).toBeGreaterThan(1000);
  expect([body[0], body[1], body[2]]).toEqual([0xff, 0xd8, 0xff]); // JPEG magic bytes
});
