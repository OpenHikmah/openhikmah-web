import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { DIVINE_NAMES } from "../lib/divine-names";
import { test, expect } from "./fixtures/auth";

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const FIRST_DIVINE_NAME_SLUG = DIVINE_NAMES[0].slug;

async function gotoAndSettle(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function scanAndAssert(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));
  const advisory = results.violations.filter((v) => !BLOCKING_IMPACTS.has(v.impact ?? ""));

  if (advisory.length > 0) {
    console.warn(
      `[a11y] ${label}: ${advisory.length} moderate/minor violation(s), not failing the build:`,
      advisory.map((v) => `${v.id} (${v.impact})`).join(", ")
    );
  }

  expect(blocking, `${label}: serious/critical a11y violations`).toEqual([]);
}

test.describe("accessibility", () => {
  test("home page has no serious a11y violations", async ({ page }) => {
    await page.goto("/");
    await scanAndAssert(page, "home");
  });

  test("canvas page has no serious a11y violations", async ({ authenticatedPage: page }) => {
    await page.goto("/canvas");
    await scanAndAssert(page, "canvas");
  });

  test("social page has no serious a11y violations", async ({ authenticatedPage: page }) => {
    await page.goto("/social");
    await scanAndAssert(page, "social");
  });

  test("today page has no serious a11y violations", async ({ authenticatedPage: page }) => {
    await gotoAndSettle(page, "/today");
    await scanAndAssert(page, "today");
  });

  test("names index has no serious a11y violations", async ({ page }) => {
    await gotoAndSettle(page, "/names");
    await scanAndAssert(page, "names index");
  });

  test("names detail page has no serious a11y violations", async ({ page }) => {
    await gotoAndSettle(page, `/names/${FIRST_DIVINE_NAME_SLUG}`);
    await scanAndAssert(page, "names detail");
  });

  test("bookmarks page has no serious a11y violations", async ({ authenticatedPage: page }) => {
    await gotoAndSettle(page, "/bookmarks");
    await scanAndAssert(page, "bookmarks");
  });

  test("workspaces page has no serious a11y violations", async ({ authenticatedPage: page }) => {
    await gotoAndSettle(page, "/workspaces");
    await scanAndAssert(page, "workspaces");
  });

  test("onboarding page has no serious a11y violations", async ({ authenticatedPage: page }) => {
    await gotoAndSettle(page, "/onboarding");
    await scanAndAssert(page, "onboarding");
  });
});
