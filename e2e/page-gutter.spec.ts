import { test, expect } from "./fixtures/auth";

// Regression coverage for issue #770: page content flush with the viewport
// edges on phones. Measure the header row (the <h1>'s flex parent), not <main>
// — main's own box spans the full width and includes its padding — and not the
// <h1> itself, which sits after a 32px icon+gap and would pass with zero gutter.
const VIEWPORT_WIDTH = 375;
const GUTTER = 16;

test.describe("mobile page gutters", () => {
  test.use({ viewport: { width: VIEWPORT_WIDTH, height: 812 } });

  for (const path of ["/settings", "/bookmarks", "/mentions", "/workspaces"]) {
    test(`${path} keeps a 16px side gutter`, async ({ authenticatedPage: page }) => {
      await page.goto(path);
      const heading = page.locator("main h1");
      await expect(heading).toBeVisible({ timeout: 15000 });

      const box = await heading.locator("xpath=..").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(GUTTER);
      expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORT_WIDTH - GUTTER);
    });
  }
});
