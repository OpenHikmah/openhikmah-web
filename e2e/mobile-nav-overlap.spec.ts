import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";

// Regression coverage for content clipped behind the fixed MobileNavBar
// (`components/layout/MobileNavBar.tsx`). The bar is `fixed inset-x-0
// bottom-0` and does not occupy layout flow, so any scrollable page/view that
// renders it must reserve matching bottom clearance. Each assertion here
// measures a piece of *real* content — never an element whose own box
// includes the sacrificial clearance padding, which would make the
// assertion trivially pass even with zero padding.
test.describe("mobile nav bar overlap", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function navBarTop(page: Page): Promise<number> {
    const navBar = page.locator("nav.fixed");
    await expect(navBar).toBeVisible();
    const box = await navBar.boundingBox();
    if (!box) throw new Error("nav bar has no bounding box");
    return box.y;
  }

  // `scrollIntoViewIfNeeded` only scrolls the minimum distance to bring an
  // element into view — a no-op if it's already visible — so it can't be
  // trusted to reach the true bottom of a scroll container. Scroll the
  // container to its max explicitly before measuring.
  async function scrollToBottom(page: Page, containerSelector: string | null) {
    if (containerSelector) {
      await page.locator(containerSelector).evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    } else {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
  }

  test("Saved quick-link on the signed-in landing page clears the nav bar", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/");
    // PersonalHome renders after the dev-login token round-trip resolves the
    // session; wait for its content rather than a fixed sleep.
    const savedLink = page.locator("main a[href='/bookmarks']");
    await expect(savedLink).toBeVisible();

    const navTop = await navBarTop(page);
    await scrollToBottom(page, "main");
    const box = await savedLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(navTop + 1);
  });

  test("last verse's translation on a surah page clears the nav bar", async ({ page }) => {
    // Al-Kahf (18) — 110 verses, long enough to actually overflow a 390x844
    // viewport, unlike a short surah where every verse already fits on screen.
    await page.goto("/surah/18");
    const navTop = await navBarTop(page);
    await scrollToBottom(page, null);

    // The translation paragraph of the last verse is the true final element
    // on this page (it has no footer) — not the Arabic paragraph above it,
    // whose own box ends well short of the page's actual bottom.
    const lastTranslation = page.locator("p:not([dir='rtl'])").last();
    const box = await lastTranslation.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(navTop + 1);
  });

  test("footer text on a story page clears the nav bar", async ({ page }) => {
    await page.goto("/stories/ibrahim");
    const navTop = await navBarTop(page);
    await scrollToBottom(page, null);

    // <footer> has no wrapping element around its text, and the footer
    // element's own box includes its sacrificial bottom padding — so measure
    // the text itself via Range, which reflects only the rendered glyphs.
    const textBottom = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) return null;
      const range = document.createRange();
      range.selectNodeContents(footer);
      const rect = range.getBoundingClientRect();
      return rect.bottom;
    });
    expect(textBottom).not.toBeNull();
    expect(textBottom!).toBeLessThanOrEqual(navTop + 1);
  });
});
