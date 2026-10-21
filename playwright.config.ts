import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a dedicated `pnpm dev` on a free port with its
 * own embedded database and local storage, so they never touch ./.data/pg or
 * ./.data/storage. Everything the tests need is forced to the offline mocks.
 *
 *   pnpm test:e2e                 # pick a free port
 *   E2E_PORT=3999 pnpm test:e2e   # fixed port
 */
function freePort(): number {
  const script = 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})';
  return Number(execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }).trim());
}

// Resolve the port once in the runner and hand it to worker processes through the
// environment, because this file is evaluated again inside every worker.
process.env.E2E_PORT ??= String(freePort());
const port = Number(process.env.E2E_PORT);
// `localhost`, not 127.0.0.1: Next dev treats other hostnames as cross-origin and blocks its own scripts.
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./.data/e2e-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "./.data/e2e-report" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: `${baseURL}/sign-in`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      E2E_TEST: "1",
      APP_URL: baseURL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-real-deployments-0123456789",
      PGLITE_DIR: "./.data/e2e-pg",
      LOCAL_STORAGE_DIR: "./.data/e2e-storage",
      // Hermetic: embedded database, in-process queue, local storage, mock providers, console mail.
      DATABASE_URL: "",
      REDIS_URL: "",
      STORAGE_DRIVER: "local",
      TRYON_PROVIDERS: "mock",
      VISION_PROVIDER: "mock",
      RESEND_API_KEY: "",
      // The reels spec needs 60 + 5 x 40 credits on top of one image run.
      TRIAL_CREDITS: process.env.E2E_REELS === "1" ? "400" : "100",
      // A second `next dev` beside a running one needs its own build directory (see next.config.ts).
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".data/e2e-next",
      VIDEO_PROVIDERS: "mock",
      STORYBOARD_PROVIDER: "mock",
    },
  },
});
