import { test, expect } from "./fixtures/auth";

test.describe("stories", () => {
  test("index lists all launch stories", async ({ page }) => {
    await page.goto("/stories");

    await expect(page.getByRole("heading", { name: /the stories of the prophets/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /yusuf/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /musa/i })).toBeVisible();
  });

  test("a story page renders chapters with Arabic and translation", async ({ page }) => {
    await page.goto("/stories/yusuf");

    await expect(
      page.getByRole("heading", { name: "Eleven stars, the sun, and the moon" })
    ).toBeVisible();
    await expect(page.getByText("12:4", { exact: true })).toBeVisible();
    // Arabic verse text renders dir="rtl" — confirm at least one is present.
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
  });

  test("an unknown slug 404s", async ({ page }) => {
    // Next dev mode doesn't surface a real 404 status on the initial response
    // for notFound() (a known dev-server quirk, also true of the pre-existing
    // /names/[slug] route) — assert on the rendered not-found content instead.
    await page.goto("/stories/not-a-real-prophet");
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
  });

  test("open on canvas adds the chapter's verses, and a second click adds none", async ({
    page,
  }) => {
    await page.goto("/stories/yusuf");

    // 30s: /canvas is a heavy route (ReactFlow + deps) and this is often its
    // first on-demand compile of the run — the same Next-dev cold-compile
    // delay documented in e2e/settings.spec.ts's Bookmarks navigation tests.
    const openButtons = page.getByRole("button", { name: /open on canvas/i });
    await openButtons.first().click();

    await expect(page).toHaveURL(/\/canvas/, { timeout: 30000 });
    await expect(page.getByText("12:4", { exact: true })).toBeVisible();
    await expect(page.getByText("12:5", { exact: true })).toBeVisible();
    await expect(page.getByText("12:6", { exact: true })).toBeVisible();

    // Client-side back nav (not page.goto) so the canvas store's in-memory
    // state survives, the same way it would for a real user — this is what
    // actually exercises the hasNode dedupe path rather than a fresh, empty
    // store from a full page reload.
    await page.goBack();
    await expect(page).toHaveURL(/\/stories\/yusuf/, { timeout: 15000 });
    await page
      .getByRole("button", { name: /open on canvas/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/canvas/, { timeout: 30000 });

    // Re-adding the same chapter must not duplicate its verse nodes.
    await expect(page.getByText("12:4", { exact: true })).toHaveCount(1);
  });
});
