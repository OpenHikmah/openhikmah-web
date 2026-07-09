import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Playwright's own process doesn't get .env.local the way `next dev` does —
// only the spawned webServer subprocess picks it up. Fixtures like
// e2e/fixtures/auth.ts read process.env.DEV_AUTH_TOKEN directly, so load it
// here too (mirrors Next.js's own env loading; see @next/env docs).
loadEnvConfig(process.cwd());

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // All e2e tests share one fixed dev-bypass identity (DEV_AUTH_TOKEN/DEV_AUTH_QF_ID),
  // so running them in parallel causes real cross-test collisions on that user's data.
  // This is a correctness requirement, not a CI-only resource limit — keep it unconditional.
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Must be `next dev`, not a production build: the dev-login auth bypass
    // (lib/social-auth.ts:36-50) requires NODE_ENV !== "production", which
    // `next build && next start` cannot satisfy.
    command: `bun run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
