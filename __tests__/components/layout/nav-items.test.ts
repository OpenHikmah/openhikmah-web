import { describe, it, expect } from "vitest";
import { NAV_ITEMS, isNavItemActive } from "@/components/layout/nav-items";

describe("nav-items", () => {
  it("has 5 desktop items including Bookmarks", () => {
    expect(NAV_ITEMS).toHaveLength(5);
    expect(NAV_ITEMS.some((i) => i.href === "/bookmarks")).toBe(true);
  });

  it("only Bookmarks is marked mobile: false", () => {
    const excluded = NAV_ITEMS.filter((i) => i.mobile === false);
    expect(excluded.map((i) => i.href)).toEqual(["/bookmarks"]);
  });

  it("mobile-visible items are Canvas, Search, Stories, Names (4 tabs)", () => {
    const mobileItems = NAV_ITEMS.filter((i) => i.mobile !== false);
    expect(mobileItems.map((i) => i.href)).toEqual(["/canvas", "/search", "/stories", "/names"]);
  });

  describe("isNavItemActive", () => {
    it("matches /canvas exactly, not as a prefix", () => {
      expect(isNavItemActive("/canvas", "/canvas")).toBe(true);
      expect(isNavItemActive("/canvas/foo", "/canvas")).toBe(false);
    });

    it("matches other routes by prefix", () => {
      expect(isNavItemActive("/names/al-hakim", "/names")).toBe(true);
      expect(isNavItemActive("/search", "/names")).toBe(false);
    });
  });
});
