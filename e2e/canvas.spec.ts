import { test, expect } from "./fixtures/auth";

test.describe("canvas", () => {
  test("adding a seed verse shows it on the canvas, Clear removes it, and Undo brings it back", async ({
    authenticatedPage: page,
  }) => {
    // The first-visit tour is a focus-trapping dialog and is not what this test covers.
    await page.addInitScript(() => localStorage.setItem("open-hikmah-tour-seen", "1"));
    await page.goto("/canvas");

    await page.getByRole("button", { name: /search verses/i }).click();
    await page.getByRole("button", { name: /ayat al-kursi/i }).click();

    await expect(page.getByText("2:255")).toBeVisible();
    // A seed verse starts a theme search; let it end (CI has no AI key, so it fails).
    await expect(page.getByText(/finding verses by/i)).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Clear canvas" }).click();

    await expect(page.getByRole("button", { name: /search verses/i })).toBeVisible();
    await expect(page.getByText("2:255")).toHaveCount(0);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("2:255").first()).toBeVisible();
  });
});
