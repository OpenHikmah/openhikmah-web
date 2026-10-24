import { test, expect } from "./fixtures/auth";

test.describe("canvas", () => {
  test("adding a seed verse shows it on the canvas, Clear removes it, and Undo brings it back", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/canvas");

    await page.getByRole("button", { name: /search verses/i }).click();
    await page.getByRole("button", { name: /ayat al-kursi/i }).click();

    await expect(page.getByText("2:255")).toBeVisible();

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Clear canvas" }).click();

    await expect(page.getByRole("button", { name: /search verses/i })).toBeVisible();
    await expect(page.getByText("2:255")).toHaveCount(0);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("2:255").first()).toBeVisible();
  });
});
