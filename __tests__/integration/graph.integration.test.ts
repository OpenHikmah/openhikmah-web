import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";

// Real Postgres (Testcontainers) — only the AI call is mocked. The generator
// uses callAIDetailed; mockCallAI stays the text source so assertions on call
// count / response body are unchanged.
const { mockCallAI } = vi.hoisted(() => ({ mockCallAI: vi.fn() }));
vi.mock("@/lib/ai/ai", () => ({
  callAIDetailed: vi.fn(async (prompt: string) => ({
    text: await mockCallAI(prompt),
    usage: { inputTokens: 100, outputTokens: 20 },
    provider: "claude" as const,
    model: "claude-opus-4-7",
  })),
  resolveProvider: vi.fn(async () => "claude" as const),
  defaultModelFor: (p: string) => (p === "gemini" ? "gemini-3.5-flash-lite" : "claude-opus-4-7"),
}));
// Guard against accidental network in the resolver fallback — everything must
// resolve from the seeded corpus.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: false }))
);

import { db } from "@/lib/infra/db";
import { verses, connections, aiGenerations } from "@/lib/infra/db/schema";
import { getConnections } from "@/lib/ai/graph-service";
import { consume } from "@/lib/infra/rate-limit";

async function reset() {
  // word_morphology is included even though this file never seeds it — root
  // discovery reads real DB state, and another integration file (connection-
  // discovery) seeds roots for ref "1:1" used here too. Since files share one
  // container and run serially (not parallel) but each only cleans up its own
  // tables, leftover rows would otherwise leak into this file's "root" test.
  await db.execute(
    sql`TRUNCATE verses, connections, ai_generations, rate_limits, word_morphology RESTART IDENTITY CASCADE`
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

  it("caches connections per locale: a hit in one locale still generates for another", async () => {
    await seed("2:255");
    mockCallAI
      .mockResolvedValueOnce(JSON.stringify([{ ref: "2:255", reason: "throne verse" }]))
      .mockResolvedValueOnce(JSON.stringify([{ ref: "2:255", reason: "ayet-el kursi" }]));

    const en = await getConnections("1:1", "thematic", source, { locale: "en" });
    expect(en[0]).toMatchObject({ reason: "throne verse" });
    expect(mockCallAI).toHaveBeenCalledTimes(1);

    // Different locale — must NOT hit the English row, generates its own.
    const tr = await getConnections("1:1", "thematic", source, { locale: "tr" });
    expect(tr[0]).toMatchObject({ reason: "ayet-el kursi" });
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    expect(await db.select().from(connections)).toHaveLength(2);

    // Re-requesting English now serves from cache, not a third AI call.
    const enAgain = await getConnections("1:1", "thematic", source, { locale: "en" });
    expect(enAgain[0]).toMatchObject({ reason: "throne verse" });
    expect(mockCallAI).toHaveBeenCalledTimes(2);
  });

  it("persists a concrete model id even when no provider is passed (resolves the flag)", async () => {
    await seed("2:255");
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:255", reason: "throne verse" }]));

    await getConnections("1:1", "thematic", source);

    const [row] = await db.select().from(connections);
    // resolveProvider() → "claude" in this mock, so the row is attributed to the
    // Claude default model, never left null / ANTHROPIC_MODEL-dependent.
    expect(row.model).toBe("claude-opus-4-7");
  });

  it("single-flight does not coalesce concurrent generations for different providers", async () => {
    await seed("2:255");
    const response = JSON.stringify([{ ref: "2:255", reason: "throne verse" }]);

    // Deterministic overlap: pin the first call at the AI boundary (after its
    // DB read + inFlight.set) until the second call has run to completion, so
    // the two are genuinely in flight together. If the key were provider-blind,
    // the second would coalesce onto the first and mockCallAI would fire once.
    let firstAtBoundary!: () => void;
    const reachedBoundary = new Promise<void>((r) => (firstAtBoundary = r));
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => (releaseFirst = r));
    mockCallAI
      .mockImplementationOnce(async () => {
        firstAtBoundary();
        await firstGate;
        return response;
      })
      .mockImplementation(async () => response);

    const p1 = getConnections("1:1", "thematic", source, { provider: "claude" });
    await reachedBoundary;
    // The second request must run to completion while p1 is still gated, so the
    // two are genuinely in flight together. If the key were provider-blind, p2
    // would coalesce onto the gated p1 and this await would hang — bound it with
    // a race so a regression fails fast instead of hitting the suite timeout.
    let b: Awaited<typeof p1>;
    try {
      b = await Promise.race([
        getConnections("1:1", "thematic", source, { provider: "gemini" }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("p2 coalesced onto the gated p1 (provider-blind key)")),
            2000
          )
        ),
      ]);
    } finally {
      releaseFirst();
    }
    const a = await p1;

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(mockCallAI).toHaveBeenCalledTimes(2);
  });

  it("the unique index dedupes duplicate edges", async () => {
    await db
      .insert(connections)
      .values({ fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "a" });
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
