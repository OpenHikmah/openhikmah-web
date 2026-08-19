import { test, expect } from "./fixtures/auth";

test.describe("admin console", () => {
  test("allowlisted admin can reach the console", async ({ authenticatedPage: page }) => {
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText(/could not be found/i)).toHaveCount(0);
  });

  test("a signed-out visitor is denied, not shown the console", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.getByText(/could not be found/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
  });
});
