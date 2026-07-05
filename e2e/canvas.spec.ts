import { test, expect } from "./fixtures/auth";

test.describe("canvas", () => {
  test("adding a seed verse shows it on the canvas, and Clear removes it", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/canvas");

    await page.getByRole("button", { name: /search verses/i }).click();
    await page.getByRole("button", { name: /ayat al-kursi/i }).click();

    await expect(page.getByText("2:255")).toBeVisible();

    await page.getByRole("button", { name: /clear/i }).click();

    await expect(page.getByRole("button", { name: /search verses/i })).toBeVisible();
    await expect(page.getByText("2:255")).toHaveCount(0);
  });
});
