import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";

// Real Postgres + pgvector (Testcontainers). Only the embedding API is mocked so
// the query path is deterministic; the ranking itself is done by real pgvector.
const { mockEmbed } = vi.hoisted(() => ({ mockEmbed: vi.fn() }));
vi.mock("@/lib/ai/ai", () => ({ embed: mockEmbed }));
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: false }))
);

import { db } from "@/lib/infra/db";
import { verses } from "@/lib/infra/db/schema";
import { searchByMeaning, similarVerses, semanticCandidates } from "@/lib/quran/semantic-search";

const DIM = 768;
/** A 768-d unit-ish vector controlled by its first two components. */
function vec(a: number, b: number): number[] {
  const arr = new Array(DIM).fill(0);
  arr[0] = a;
  arr[1] = b;
  return arr;
}

async function reset() {
  await db.execute(sql`TRUNCATE verses, verse_embeddings RESTART IDENTITY CASCADE`);
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

async function seedEmbedding(ref: string, v: number[]) {
  const literal = `[${v.join(",")}]`;
  await db.execute(
    sql`INSERT INTO verse_embeddings (ref, embedding, model) VALUES (${ref}, ${literal}::vector, 'test-model')`
  );
}

beforeEach(async () => {
  mockEmbed.mockReset();
  await reset();
  // 1:1 points along axis-0; 2:2 is close to it; 3:3 is orthogonal (far).
  await seedVerse("1:1");
  await seedVerse("2:2");
  await seedVerse("3:3");
  await seedEmbedding("1:1", vec(1, 0));
  await seedEmbedding("2:2", vec(0.8, 0.6));
  await seedEmbedding("3:3", vec(0, 1));
});

describe("semantic search (integration, real pgvector)", () => {
  it("similarVerses ranks by cosine similarity and excludes the source verse", async () => {
    const out = await similarVerses("1:1", 5);
    expect(out.map((m) => m.verse.ref)).toEqual(["2:2", "3:3"]);
    expect(out[0].similarity).toBeGreaterThan(out[1].similarity);
  });

  it("similarVerses returns [] for a verse with no stored embedding", async () => {
    expect(await similarVerses("9:9", 5)).toEqual([]);
  });

  it("searchByMeaning ranks the corpus against the embedded query", async () => {
    mockEmbed.mockResolvedValue(vec(1, 0));
    const out = await searchByMeaning("anything", 3);
    expect(out[0].verse.ref).toBe("1:1");
    expect(out.map((m) => m.verse.ref)).toEqual(["1:1", "2:2", "3:3"]);
  });

  it("searchByMeaning short-circuits on blank query without embedding", async () => {
    const out = await searchByMeaning("   ", 3);
    expect(out).toEqual([]);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("semanticCandidates returns nearest refs excluding the source", async () => {
    expect(await semanticCandidates("1:1", 5)).toEqual(["2:2", "3:3"]);
  });

  it("semanticCandidates excludes additional refs already surfaced to the caller", async () => {
    expect(await semanticCandidates("1:1", 5, ["2:2"])).toEqual(["3:3"]);
  });

  it("similarVerses excludes additional refs already surfaced to the caller", async () => {
    const out = await similarVerses("1:1", 5, ["2:2"]);
    expect(out.map((m) => m.verse.ref)).toEqual(["3:3"]);
  });
});
