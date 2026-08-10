import { test, expect } from "./fixtures/auth";

test.describe("settings page", () => {
  test("changing reciter is reflected in the next audio play", async ({ page }) => {
    // This test's real bottleneck is a live request to the islamic.network CDN
    // (not mocked): the default 30s per-test timeout is what was flaking in CI,
    // not the waitForRequest call itself — raise both together.
    test.setTimeout(60000);
    await page.goto("/settings");

    await page.getByRole("combobox", { name: /reciter/i }).click();
    await page.getByRole("option", { name: /Mahmoud Al-Husary/i }).click();

    await page.goto("/canvas?verse=1:1");
    const audioRequest = page.waitForRequest((req) => req.url().includes("cdn.islamic.network"), {
      timeout: 45000,
    });
    // exact: true — the verse node's own card is itself an interactive
    // element whose accessible name concatenates its children's labels
    // (including "Play recitation"), so a substring/regex match resolves to
    // both the card and the actual play button.
    await page.getByRole("button", { name: "Play recitation", exact: true }).click();

    const request = await audioRequest;
    expect(request.url()).toContain("/ar.husary/");
  });
});

test.describe("language switching", () => {
  test("switching language via the header popover persists across reload", async ({ page }) => {
    await page.goto("/search");
    // First hit on /search in this file — next dev compiles it on demand, and
    // under CI resource contention the page can paint before React finishes
    // hydrating. A click that lands before hydration is a silent no-op (the
    // popover trigger has no handler attached yet), so wait for the network
    // to settle before treating the page as interactive.
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /change language/i }).click();
    await page.getByRole("button", { name: "Türkçe" }).click();

    // Nav chrome (server-rendered from the cookie-resolved locale) shows the
    // Turkish next-intl strings once router.refresh() re-renders the layout.
    await expect(page.getByRole("link", { name: "Kanvas" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");

    // /settings reads the same preferences store — its Interface language
    // select reflects the switch made via the header popover. Select by #id
    // rather than accessible name — the aria-label is now translation-driven
    // (settings.interfaceLanguage), so it no longer reads "Interface language"
    // once the locale is tr.
    await page.goto("/settings");
    await expect(page.locator("#interface-language")).toHaveText("Türkçe");

    // The store persists to localStorage and re-syncs the oh_locale cookie on
    // rehydration, so the choice survives a full reload, not just client nav.
    await page.reload();
    await expect(page.locator("#interface-language")).toHaveText("Türkçe");
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "oh_locale")?.value).toBe("tr");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  });
});

test.describe("mobile bottom nav", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows 4 tabs and excludes Saved from the tab bar", async ({ page }) => {
    await page.goto("/search");

    const tabBar = page.locator("nav").filter({ has: page.getByRole("link", { name: "Canvas" }) });
    await expect(tabBar.getByRole("link")).toHaveCount(4);
    await expect(tabBar.getByRole("link", { name: /saved/i })).toHaveCount(0);
  });

  test("Saved is reachable via the account menu when signed in", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/search");

    await page.getByRole("button", { name: /account menu/i }).click();
    // Exact match: the loose /saved/i regex also matches the adjacent "Saved
    // canvases" workspaces link in this same menu.
    const savedLink = page.getByRole("menu").getByRole("link", { name: "Saved", exact: true });
    await expect(savedLink).toBeVisible();
    await savedLink.click();
    // 15s: Next dev serves routes with on-demand compilation, and this may be
    // the first hit on /bookmarks in a fresh dev server — well past the
    // default 5s assertion timeout on a cold compile.
    await expect(page).toHaveURL(/\/bookmarks/, { timeout: 15000 });
  });

  test("Saved is reachable next to Log in when signed out", async ({ page }) => {
    await page.goto("/search");

    const savedLink = page.getByRole("link", { name: "Saved" });
    await expect(savedLink).toBeVisible();
    await savedLink.click();
    await expect(page).toHaveURL(/\/bookmarks/, { timeout: 15000 });
  });
});
