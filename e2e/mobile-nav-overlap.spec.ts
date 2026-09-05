import { test, expect } from "./fixtures/auth";

// Regression coverage for content clipped behind the fixed MobileNavBar
// (`components/layout/MobileNavBar.tsx`) on mobile. The bar is `fixed
// inset-x-0 bottom-0` and does not occupy layout flow, so any scrollable
// page/view that renders it must reserve matching bottom clearance —
// verified here by comparing bounding boxes rather than viewport visibility,
// since the bug is specifically about sitting *behind* a fixed element.
test.describe("mobile nav bar overlap", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function expectClearOfNavBar(page: import("@playwright/test").Page, locator: string) {
    const navBar = page.locator("nav").filter({ has: page.getByRole("link", { name: "Canvas" }) });
    await expect(navBar).toBeVisible();

    const target = page.locator(locator).last();
    await target.scrollIntoViewIfNeeded();

    const [navBox, targetBox] = await Promise.all([navBar.boundingBox(), target.boundingBox()]);
    expect(navBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  }

  test("Saved quick-link on the signed-in landing page clears the nav bar", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/");
    // PersonalHome renders after the dev-login token round-trip resolves the
    // session; wait for its content rather than a fixed sleep.
    await expect(page.locator('a[href="/bookmarks"]').last()).toBeVisible();
    await expectClearOfNavBar(page, 'a[href="/bookmarks"]');
  });

  test("last verse on a surah page clears the nav bar", async ({ page }) => {
    await page.goto("/surah/114");
    await expectClearOfNavBar(page, "p[dir='rtl']");
  });

  test("last chapter's content on a story page clears the nav bar", async ({ page }) => {
    await page.goto("/stories/ibrahim");
    // Checks the last real content (the "Open on canvas" button), not the
    // `<footer>` element itself — the footer's own box includes the
    // sacrificial bottom padding that's meant to sit *behind* the nav bar,
    // so asserting on it would trivially "pass" even with zero padding.
    await expectClearOfNavBar(page, "button:has-text('Open on canvas')");
  });
});
