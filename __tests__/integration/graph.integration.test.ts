import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";

// Real Postgres (Testcontainers) — only the AI call is mocked. The generator
// uses callAIDetailed; mockCallAI stays the text source so assertions on call
// count / response body are unchanged.
const { mockCallAI } = vi.hoisted(() => ({ mockCallAI: vi.fn() }));
vi.mock("@/lib/ai/ai", () => ({
  callAI: vi.fn((prompt: string) => mockCallAI(prompt)),
  callAIDetailed: vi.fn(async (prompt: string) => ({
    text: await mockCallAI(prompt),
    usage: { inputTokens: 100, outputTokens: 20 },
    provider: "claude" as const,
    model: "claude-opus-4-7",
  })),
  resolveProvider: vi.fn(
    async (_feature: string, override?: string) => (override ?? "claude") as "claude" | "gemini"
  ),
  resolveModel: vi.fn(
    async (_feature: string, provider: string, override?: string) =>
      override ?? (provider === "gemini" ? "gemini-3.5-flash-lite" : "claude-opus-4-7")
  ),
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

  it("a non-en request translates the canonical English selection, never re-derives it", async () => {
    await seed("2:255");
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.startsWith("Translate the following sentence")) return "ayet-el kürsi";
      return JSON.stringify([{ ref: "2:255", reason: "throne verse" }]);
    });

    const en = await getConnections("1:1", "thematic", source, { locale: "en" });
    expect(en[0]).toMatchObject({ ref: "2:255", reason: "throne verse" });
    expect(mockCallAI).toHaveBeenCalledTimes(1); // one generation

    // Turkish: same verse selection, reason translated — one extra call, NO regeneration.
    const tr = await getConnections("1:1", "thematic", source, { locale: "tr" });
    expect(tr[0]).toMatchObject({ ref: "2:255", reason: "ayet-el kürsi" });
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    const rows = await db.select().from(connections);
    expect(rows).toHaveLength(2); // en + tr, same toRef
    expect(rows.filter((r) => r.locale === "tr").map((r) => r.toRef)).toEqual(["2:255"]);

    // Both locales now cached — no further AI calls.
    expect((await getConnections("1:1", "thematic", source, { locale: "en" }))[0]).toMatchObject({
      reason: "throne verse",
    });
    expect((await getConnections("1:1", "thematic", source, { locale: "tr" }))[0]).toMatchObject({
      reason: "ayet-el kürsi",
    });
    expect(mockCallAI).toHaveBeenCalledTimes(2);
  });

  it("a partial locale cache is repaired on the next request — only the missing ref is re-translated", async () => {
    await seed("2:255");
    await seed("3:18");
    let attemptsForA = 0;
    let translationCalls = 0;
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.startsWith("Translate the following sentence")) {
        translationCalls++;
        if (prompt.includes("reason A")) {
          // First attempt for A fails (empty → English fallback, not persisted);
          // a later attempt succeeds.
          return attemptsForA++ === 0 ? "" : "tr A";
        }
        return "tr B";
      }
      return JSON.stringify([
        { ref: "2:255", reason: "reason A" },
        { ref: "3:18", reason: "reason B" },
      ]);
    });

    // Cold tr request: en generated, B translates, A fails → only B persisted for tr.
    const first = await getConnections("1:1", "thematic", source, { locale: "tr" });
    expect(first.map((c) => c.reason)).toEqual(["reason A", "tr B"]);
    let rows = await db.select().from(connections);
    expect(rows.filter((r) => r.locale === "tr").map((r) => r.toRef)).toEqual(["3:18"]);
    expect(translationCalls).toBe(2);

    // Next tr request: 1 tr row < 2 en rows → not a hit. It re-translates ONLY A
    // (B is reused from cache) and does NOT regenerate the English selection.
    const second = await getConnections("1:1", "thematic", source, { locale: "tr" });
    expect(second.map((c) => c.reason)).toEqual(["tr A", "tr B"]);
    expect(translationCalls).toBe(3); // just the one retry for A
    rows = await db.select().from(connections);
    expect(
      rows
        .filter((r) => r.locale === "tr")
        .map((r) => r.toRef)
        .sort()
    ).toEqual(["2:255", "3:18"]);
    // One English generation total across both requests.
    expect(await db.select().from(aiGenerations)).toHaveLength(1);

    // Now complete: a third tr request is a pure cache hit.
    const third = await getConnections("1:1", "thematic", source, { locale: "tr" });
    expect(third.map((c) => c.reason)).toEqual(["tr A", "tr B"]);
    expect(translationCalls).toBe(3);
  });

  it("a cold non-en request generates English first, then translates it", async () => {
    await seed("2:255");
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.startsWith("Translate the following sentence")) return "witness of oneness (ru)";
      return JSON.stringify([{ ref: "2:255", reason: "witness of oneness" }]);
    });

    const ru = await getConnections("1:1", "thematic", source, { locale: "ru" });

    expect(ru[0]).toMatchObject({ ref: "2:255", reason: "witness of oneness (ru)" });
    expect(mockCallAI).toHaveBeenCalledTimes(2); // 1 English generation + 1 translation
    const rows = await db.select().from(connections);
    expect(rows.map((r) => r.locale).sort()).toEqual(["en", "ru"]);
    expect(rows.find((r) => r.locale === "en")?.reason).toBe("witness of oneness");
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
