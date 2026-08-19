import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";

// Real Postgres (Testcontainers). Confirms the route's SQL orderBy actually
// sorts numerically, not just that a mocked chain was called with the right args.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: false }))
);

import { db } from "@/lib/infra/db";
import { verses, wordMorphology } from "@/lib/infra/db/schema";
import { GET } from "@/app/api/root/[root]/route";

async function reset() {
  await db.execute(sql`TRUNCATE verses, word_morphology RESTART IDENTITY CASCADE`);
}

async function seedVerse(ref: string, root: string) {
  const [s, a] = ref.split(":");
  await db.insert(verses).values({
    ref,
    surah: Number(s),
    ayah: Number(a),
    arabicText: `arabic-${ref}`,
    translation: `translation-${ref}`,
  });
  await db.insert(wordMorphology).values({ ref, position: 1, surface: `w-${ref}`, root });
}

function req() {
  return new NextRequest("http://localhost/api/root/رحم");
}
function params(root: string) {
  return { params: Promise.resolve({ root }) };
}

beforeEach(async () => {
  await reset();
});

describe("GET /api/root/[root] — numeric sort (integration, real Postgres)", () => {
  it("returns results in canonical (surah, ayah) order, not lexicographic", async () => {
    // Lexicographic order on "surah:ayah" text would be "10:1", "2:10", "2:2".
    await seedVerse("10:1", "رحم");
    await seedVerse("2:10", "رحم");
    await seedVerse("2:2", "رحم");

    const res = await GET(req(), params("رحم"));
    const body = await res.json();

    expect(body.verses.map((v: { ref: string }) => v.ref)).toEqual(["2:2", "2:10", "10:1"]);
  });
});
