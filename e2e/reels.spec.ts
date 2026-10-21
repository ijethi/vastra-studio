import path from "node:path";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Make a reel end to end with the offline mocks:
 *   sign in → boutique → upload → generate → "Reel" on a result → Festive →
 *   nine scenes → confirm the suggested five → play, and the download is an MP4.
 * Opt in with E2E_REELS=1 (playwright.config.ts then grants 400 trial credits).
 * The mock clips are rendered with the bundled ffmpeg, so this takes a few minutes.
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_REELS !== "1", "set E2E_REELS=1 to run the reel flow");

const SAMPLE = path.join(__dirname, "..", "public", "samples", "sample-kurta.jpg");
const RUN = Date.now().toString(36);
const EMAIL = `e2e-reel-${RUN}@example.com`;
const BOUTIQUE = `Reel Boutique ${RUN}`;

let context: BrowserContext;
let page: Page;

const credits = () => page.getByRole("link", { name: /^Credits/ });

async function readLatestCode(email: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const res = await page.request.get(`/api/dev/last-otp?email=${encodeURIComponent(email)}`);
    if (res.ok()) return ((await res.json()) as { code: string }).code;
    await page.waitForTimeout(250);
  }
  throw new Error(`No one-time code captured for ${email}. Is the server running with E2E_TEST=1?`);
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  test.setTimeout(600_000);
  await page.request.get("/api/dev/last-otp?email=warmup%40example.com", { timeout: 300_000 });
  await page.goto("/sign-in", { timeout: 300_000 });
});

test.afterAll(async () => {
  await context?.close();
});

test("signs in, opens a boutique and generates the hero image", async () => {
  test.setTimeout(300_000);
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(EMAIL);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit code").fill(await readLatestCode(EMAIL));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Boutique name").fill(BOUTIQUE);
  await page.getByRole("button", { name: "Open my studio" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(credits()).toContainText("400");

  await page.locator('input[aria-label="Choose photos"]').setInputFiles(SAMPLE);
  await expect(page.locator('img[alt*=", variation "]')).toHaveCount(2, { timeout: 150_000 });
  await expect(page.getByRole("button", { name: "Make again" })).toBeVisible({ timeout: 60_000 });
});

test("sketches nine festive scenes for 60 credits", async () => {
  test.setTimeout(300_000);
  await page.getByRole("link", { name: "Reel" }).first().click();
  await expect(page).toHaveURL(/\/reels\/new\?image=img_/);
  await expect(page.getByRole("heading", { level: 1, name: "Make a reel" })).toBeVisible();

  await page.getByRole("radio", { name: "Festive" }).click();
  await page.getByRole("button", { name: /Sketch 9 scenes · 60 credits/ }).click();

  await expect(page).toHaveURL(/\/reels\/reel_/);
  await expect(page.getByRole("heading", { name: "Pick your scenes" })).toBeVisible({ timeout: 180_000 });
  // The mock gate passes everything under E2E_TEST=1, so all nine scenes are shown.
  await expect(page.getByRole("button", { name: /, scene \d$/ })).toHaveCount(5);
  await expect(page.locator('ul[aria-label="Scenes"] button')).toHaveCount(9);
  await expect(credits()).toContainText("315");
});

test("animates the suggested five clips and plays the finished reel", async () => {
  test.setTimeout(600_000);
  await page.getByRole("button", { name: /Animate 5 clips · 200 credits/ }).click();
  await expect(page.getByRole("heading", { name: /Bringing the scenes to life|Stitching your reel/ })).toBeVisible({ timeout: 30_000 });

  const player = page.getByTestId("reel-player");
  await expect(player).toBeVisible({ timeout: 540_000 });
  await expect(page.getByRole("heading", { name: "Your reel is ready" })).toBeVisible();
  await expect(credits()).toContainText("115");

  const href = await page.getByRole("link", { name: "Save" }).getAttribute("href");
  expect(href).toMatch(/^\/api\/reels\/reel_.+\/download$/);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("video/mp4");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.body();
  expect(body.length).toBeGreaterThan(10_000);
  expect(body.subarray(4, 8).toString("latin1")).toBe("ftyp");

  // The reel is listed on the garment page.
  await page.getByRole("link", { name: "Back to the garment" }).click();
  await expect(page.getByRole("heading", { name: "Reels" })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
});
