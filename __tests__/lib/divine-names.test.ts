import { describe, it, expect } from "vitest";
import {
  DIVINE_NAMES,
  CATEGORY_LABELS,
  getNameBySlug,
  getNamesByCategory,
  type NameCategory,
} from "@/lib/divine-names";

describe("DIVINE_NAMES", () => {
  it("contains exactly 99 entries", () => {
    expect(DIVINE_NAMES).toHaveLength(99);
  });

  it("ids are sequential 1–99", () => {
    const ids = DIVINE_NAMES.map((n) => n.id);
    expect(ids).toEqual(Array.from({ length: 99 }, (_, i) => i + 1));
  });

  it("every entry has required non-empty fields", () => {
    for (const name of DIVINE_NAMES) {
      expect(name.id).toBeGreaterThanOrEqual(1);
      expect(name.id).toBeLessThanOrEqual(99);
      expect(name.slug.length).toBeGreaterThan(0);
      expect(name.arabic.length).toBeGreaterThan(0);
      expect(name.transliteration.length).toBeGreaterThan(0);
      expect(name.meaning.length).toBeGreaterThan(0);
      expect(name.root.length).toBeGreaterThan(0);
      expect(name.description.length).toBeGreaterThan(0);
      expect(["dhat", "sifat", "af'al"]).toContain(name.category);
    }
  });

  it("slugs are unique", () => {
    const slugs = DIVINE_NAMES.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(99);
  });

  it("includes Ar-Rahman as first entry", () => {
    expect(DIVINE_NAMES[0].slug).toBe("ar-rahman");
    expect(DIVINE_NAMES[0].id).toBe(1);
  });

  it("includes Allah as last entry (id 99)", () => {
    const last = DIVINE_NAMES[DIVINE_NAMES.length - 1];
    expect(last.slug).toBe("allah");
    expect(last.id).toBe(99);
  });

  it("each category has at least one name", () => {
    const categories: NameCategory[] = ["dhat", "sifat", "af'al"];
    for (const cat of categories) {
      const names = DIVINE_NAMES.filter((n) => n.category === cat);
      expect(names.length).toBeGreaterThan(0);
    }
  });
});

describe("CATEGORY_LABELS", () => {
  it("has entries for all three categories", () => {
    expect(CATEGORY_LABELS["dhat"]).toBeDefined();
    expect(CATEGORY_LABELS["sifat"]).toBeDefined();
    expect(CATEGORY_LABELS["af'al"]).toBeDefined();
  });

  it("each category label has en, ar, and description", () => {
    for (const label of Object.values(CATEGORY_LABELS)) {
      expect(label.en.length).toBeGreaterThan(0);
      expect(label.ar.length).toBeGreaterThan(0);
      expect(label.description.length).toBeGreaterThan(0);
    }
  });
});

describe("getNameBySlug", () => {
  it("returns the correct name for a known slug", () => {
    const name = getNameBySlug("ar-rahman");
    expect(name).toBeDefined();
    expect(name!.id).toBe(1);
    expect(name!.meaning).toBe("The Most Gracious");
  });

  it("returns the correct name for al-alim", () => {
    const name = getNameBySlug("al-alim");
    expect(name).toBeDefined();
    expect(name!.arabic).toBe("الْعَلِيم");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getNameBySlug("nonexistent-slug")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getNameBySlug("")).toBeUndefined();
  });
});

describe("getNamesByCategory", () => {
  it("returns only names of the given category", () => {
    const dhat = getNamesByCategory("dhat");
    expect(dhat.every((n) => n.category === "dhat")).toBe(true);
  });

  it("returns non-empty array for each valid category", () => {
    expect(getNamesByCategory("dhat").length).toBeGreaterThan(0);
    expect(getNamesByCategory("sifat").length).toBeGreaterThan(0);
    expect(getNamesByCategory("af'al").length).toBeGreaterThan(0);
  });

  it("total across all categories equals 99", () => {
    const total =
      getNamesByCategory("dhat").length +
      getNamesByCategory("sifat").length +
      getNamesByCategory("af'al").length;
    expect(total).toBe(99);
  });
});
