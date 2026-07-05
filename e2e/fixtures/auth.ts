import { test as base, type Page } from "@playwright/test";

async function loginAsDevUser(page: Page): Promise<void> {
  const token = process.env.DEV_AUTH_TOKEN;
  if (!token) {
    throw new Error("DEV_AUTH_TOKEN must be set in the environment for e2e auth to work");
  }

  await page.goto("/");

  // Wait for React hydration to complete and window.__devLogin to be available
  try {
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __devLogin?: unknown };
        return typeof w.__devLogin === "function";
      },
      { timeout: 5000 }
    );
  } catch {
    throw new Error(
      "window.__devLogin is unavailable — is the app running with NODE_ENV=production?"
    );
  }

  await page.evaluate(async (t) => {
    const w = window as unknown as { __devLogin: (token: string) => Promise<void> };
    await w.__devLogin(t);
  }, token);

  await page.waitForFunction(() => sessionStorage.getItem("__devToken") !== null);
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await loginAsDevUser(page);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback param, not a React hook
    await use(page);
  },
});

export { expect } from "@playwright/test";
