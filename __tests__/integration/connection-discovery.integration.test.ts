import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";

// Real Postgres (Testcontainers). Root discovery is pure SQL over word_morphology.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: false }))
);

import { db } from "@/lib/db";
import { verses, wordMorphology } from "@/lib/db/schema";
import { discoverCandidates } from "@/lib/connection-discovery";

async function reset() {
  await db.execute(sql`TRUNCATE verses, word_morphology RESTART IDENTITY CASCADE`);
}

async function seedVerse(ref: string) {
  const [s, a] = ref.split(":");
  await db.insert(verses).values({
    ref,
    surah: Number(s),
    ayah: Number(a),
    arabicText: `arabic-${ref}`,
    translation: `translation-${ref}`,
  });
}

async function seedWords(ref: string, roots: Array<string | null>) {
  await db.insert(wordMorphology).values(
    roots.map((root, i) => ({
      ref,
      position: i + 1,
      surface: `w${i}`,
      root,
      lemma: null,
    }))
  );
}

beforeEach(async () => {
  await reset();
  await seedVerse("1:1");
  await seedVerse("2:2");
  await seedVerse("3:3");
  await seedVerse("4:4");
  // Source 1:1 has roots رحم + اله.
  await seedWords("1:1", ["رحم", "اله"]);
  await seedWords("2:2", ["رحم", "علم"]); // shares 1 root (رحم)
  await seedWords("3:3", ["رحم", "اله"]); // shares 2 roots (رحم, اله)
  await seedWords("4:4", ["صبر", null]); // shares none
});

describe("connection discovery — root (integration, real Postgres)", () => {
  it("returns verses sharing a root, ranked by number of shared roots", async () => {
    const out = await discoverCandidates("1:1", "root", 10);
    expect(out[0]).toBe("3:3"); // 2 shared roots ranks first
    expect(out).toContain("2:2"); // 1 shared root
    expect(out).not.toContain("4:4"); // no shared root
    expect(out).not.toContain("1:1"); // never the source verse
  });

  it("respects the candidate limit", async () => {
    const out = await discoverCandidates("1:1", "root", 1);
    expect(out).toEqual(["3:3"]);
  });

  it("returns [] for a verse with no morphology seeded", async () => {
    expect(await discoverCandidates("9:9", "root", 10)).toEqual([]);
  });
});
