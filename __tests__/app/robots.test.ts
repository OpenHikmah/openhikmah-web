import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

describe("robots", () => {
  it("allows all crawlers on public routes", () => {
    const result = robots();
    expect(result.rules).toEqual(
      expect.objectContaining({ userAgent: "*", allow: expect.arrayContaining(["/"]) })
    );
  });

  it("allows the shared-canvas OG image even though /api/ is disallowed (issue #753)", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule.disallow).toContain("/api/");
    expect(rule.allow).toContain("/api/share/*/opengraph-image");
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
        "/onboarding",
      ])
    );
  });

  it("points to the sitemap", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://openhikmah.com/sitemap.xml");
  });
});
