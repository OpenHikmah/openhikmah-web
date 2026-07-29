import { test, expect } from "@playwright/test";

test.describe("settings page", () => {
  test("changing reciter is reflected in the next audio play", async ({ page }) => {
    await page.goto("/settings");

    await page.getByRole("combobox", { name: /reciter/i }).click();
    await page.getByRole("option", { name: /Mahmoud Al-Husary/i }).click();

    await page.goto("/canvas?verse=1:1");
    const audioRequest = page.waitForRequest((req) => req.url().includes("cdn.islamic.network"));
    await page.getByRole("button", { name: /play/i }).first().click();

    const request = await audioRequest;
    expect(request.url()).toContain("/ar.husary/");
  });
});

test.describe("mobile bottom nav", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows 4 tabs and Bookmarks is reachable via the account menu", async ({ page }) => {
    await page.goto("/search");

    const tabBar = page.locator("nav").filter({ has: page.getByRole("link", { name: "Canvas" }) });
    await expect(tabBar.getByRole("link")).toHaveCount(4);
    await expect(tabBar.getByRole("link", { name: /bookmarks/i })).toHaveCount(0);
  });
});
