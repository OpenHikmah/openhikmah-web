import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";

// Real Postgres (Testcontainers) — only the AI call is mocked.
const { mockCallAI } = vi.hoisted(() => ({ mockCallAI: vi.fn() }));
vi.mock("@/lib/ai", () => ({ callAI: mockCallAI }));
// Guard against accidental network in the resolver fallback — everything must
// resolve from the seeded corpus.
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

import { db } from "@/lib/db";
import { verses, connections, aiGenerations } from "@/lib/db/schema";
import { getConnections } from "@/lib/graph-service";
import { consume } from "@/lib/rate-limit";

async function reset() {
  await db.execute(
    sql`TRUNCATE verses, connections, ai_generations, rate_limits RESTART IDENTITY CASCADE`
  );
}

async function seed(ref: string) {
  const [s, a] = ref.split(":");
  await db.insert(verses).values({
    ref,
    surah: Number(s),
    ayah: Number(a),
    arabicText: `arabic-${ref}`,
    translation: `translation-${ref}`,
  });
}

beforeEach(async () => {
  mockCallAI.mockReset();
  await reset();
});

const source = { arabicText: "x", translation: "y" };

describe("connection graph (integration, real Postgres)", () => {
  it("miss generates + persists; hit serves from DB with zero further AI calls", async () => {
    await seed("2:255");
    await seed("3:18");
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "throne verse" },
        { ref: "3:18", reason: "witness of oneness" },
      ])
    );

    // First call — cache miss.
    const first = await getConnections("1:1", "thematic", source);
    expect(first).toHaveLength(2);
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(await db.select().from(connections)).toHaveLength(2);
    expect(await db.select().from(aiGenerations)).toHaveLength(1);

    // Second identical call — cache hit, NO new AI call.
    const second = await getConnections("1:1", "thematic", source);
    expect(second).toHaveLength(2);
    expect(second[0]).toMatchObject({ ref: "2:255", reason: "throne verse" });
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(await db.select().from(aiGenerations)).toHaveLength(1);
  });

  it("drops a hallucinated ref that is not in the corpus", async () => {
    await seed("2:255"); // 9:999 intentionally NOT seeded
    mockCallAI.mockResolvedValue(
      JSON.stringify([
        { ref: "2:255", reason: "real" },
        { ref: "9:999", reason: "hallucinated" },
      ])
    );

    const out = await getConnections("1:1", "root", source);
    expect(out.map((c) => c.ref)).toEqual(["2:255"]);
    expect(await db.select().from(connections)).toHaveLength(1);
  });

  it("the unique index dedupes duplicate edges", async () => {
    await db.insert(connections).values({ fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "a" });
    await db
      .insert(connections)
      .values({ fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "b" })
      .onConflictDoNothing();

    expect(await db.select().from(connections)).toHaveLength(1);
  });

  it("the rate limiter increments and blocks past the limit within a window", async () => {
    expect(await consume("gen:itest", 2, 60)).toBe(true);
    expect(await consume("gen:itest", 2, 60)).toBe(true);
    expect(await consume("gen:itest", 2, 60)).toBe(false);
  });
});
