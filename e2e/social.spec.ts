import { test, expect } from "./fixtures/auth";

test.describe("social", () => {
  test("leaderboard empty state links to the Friends tab", async ({ authenticatedPage: page }) => {
    await page.goto("/social");

    await expect(page.getByText("Add friends to see them here.")).toBeVisible();
    await page.getByRole("button", { name: /go to friends/i }).click();

    await expect(page.getByPlaceholder("Search by username…")).toBeVisible();
  });

  test("searching a nonexistent username shows an empty result", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/social");
    await page.getByRole("button", { name: /^friends$/i }).click();

    await page.getByPlaceholder("Search by username…").fill("zzz-nonexistent-user-zzz");
    await expect(page.getByText("No users found.")).toBeVisible();
  });
});
