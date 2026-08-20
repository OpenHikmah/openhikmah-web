import { test, expect } from "./fixtures/auth";

test.describe("search page", () => {
  test("ref shortcut shows the exact verse with a Map on Canvas link", async ({ page }) => {
    await page.goto("/search?q=2:255");

    await expect(page.getByText("2:255", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /map on canvas/i })).toHaveAttribute(
      "href",
      "/canvas?verse=2:255"
    );
  });

  test("keyword search returns results for a common query, with no search-mode toggle", async ({
    page,
  }) => {
    await page.goto("/search");

    await page.getByPlaceholder(/search topics/i).fill("mercy");
    // The result count is locale-formatted (thousands separators), so match
    // digits/separators loosely rather than assuming a bare number.
    await expect(page.getByText(/showing [\d,.]+ results? for/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /map on canvas/i }).first()).toBeVisible();
    // There's a single unified search now — no Keyword/By meaning mode picker.
    await expect(page.getByRole("button", { name: "By meaning" })).toHaveCount(0);
  });
});

test.describe("search dialog (canvas)", () => {
  test("Cmd+K ref shortcut adds the verse to canvas", async ({ authenticatedPage: page }) => {
    await page.goto("/canvas");

    await page.getByRole("button", { name: /search verses/i }).click();
    await page.getByPlaceholder(/search topics/i).fill("2:255");
    await page.getByRole("button", { name: /map connections/i }).click();

    await expect(page.getByText("2:255")).toBeVisible();
  });
});
