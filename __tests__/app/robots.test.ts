import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

describe("robots", () => {
  it("allows all crawlers on public routes", () => {
    const result = robots();
    expect(result.rules).toEqual(expect.objectContaining({ userAgent: "*", allow: "/" }));
  });

  it("disallows private and non-content routes", () => {
    const result = robots();
    const disallow = Array.isArray(result.rules)
      ? result.rules[0]?.disallow
      : result.rules.disallow;
    expect(disallow).toEqual(
      expect.arrayContaining([
        "/api/",
        "/admin/",
        "/callback",
        "/bookmarks",
        "/settings",
        "/social",
        "/mentions",
        "/workspaces",
      ])
    );
  });

  it("points to the sitemap", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://openhikmah.com/sitemap.xml");
  });
});
