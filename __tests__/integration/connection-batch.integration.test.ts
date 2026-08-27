import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";

// Real Postgres (Testcontainers) — only the LLM call is mocked. Both connection
// generation (legacy path) and reason translation funnel through callAIDetailed.
const { mockCallAI } = vi.hoisted(() => ({ mockCallAI: vi.fn() }));
vi.mock("@/lib/ai/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ai")>();
  return {
    ...actual,
    callAI: vi.fn((prompt: string) => mockCallAI(prompt)),
    callAIDetailed: vi.fn(async (prompt: string) => ({
      text: await mockCallAI(prompt),
      usage: { inputTokens: 100, outputTokens: 20 },
      provider: "claude" as const,
      model: "claude-opus-4-7",
    })),
  };
});
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: false }))
);

import { db } from "@/lib/infra/db";
import { verses, connections, connectionCoverage, aiGenerations } from "@/lib/infra/db/schema";
import { runConnectionBatch } from "@/lib/ai/connection-batch";
import { getCoverageReport } from "@/lib/admin/coverage-report";

async function reset() {
  await db.execute(
    sql`TRUNCATE verses, connections, connection_coverage, ai_generations, rate_limits, word_morphology RESTART IDENTITY CASCADE`
  );
}

async function seed(ref: string) {
  const [s, a] = ref.split(":");
  await db.insert(verses).values({
    ref,
    surah: Number(s),
    ayah: Number(a),
    // Sacred-data rule: plausible Arabic even in fixtures (AGENTS.md §Theological
    // standards). "In the name of God, the Most Gracious, the Most Merciful."
    arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: `translation-${ref}`,
  });
}

const hooks = { onProgress: () => {} };

beforeEach(async () => {
  mockCallAI.mockReset();
  await reset();
});

describe("runConnectionBatch (integration, real Postgres)", () => {
  it("baseline: generates + persists en rows and translates them per locale", async () => {
    await seed("1:1");
    await seed("2:255");
    await seed("3:18");
    // Legacy generation returns a JSON array of refs; translation returns a
    // single localized sentence.
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.startsWith("Translate the following sentence")) return "localized reason";
      return JSON.stringify([
        { ref: "2:255", reason: "throne verse" },
        { ref: "3:18", reason: "witness of oneness" },
      ]);
    });

    const summary = await runConnectionBatch(
      {
        mode: "baseline",
        provider: "claude",
        locales: ["tr", "ru"],
        maxCalls: 500,
        maxCostUsd: 100,
      },
      hooks
    );

    expect(summary.stoppedReason).toBe("completed");
    expect(summary.generated).toBeGreaterThan(0);

    const enRows = await db
      .select()
      .from(connections)
      .where(
        sql`${connections.locale} = 'en' and ${connections.fromRef} = '1:1' and ${connections.kind} = 'thematic'`
      );
    expect(enRows.length).toBe(2);

    const trRows = await db
      .select()
      .from(connections)
      .where(
        sql`${connections.locale} = 'tr' and ${connections.fromRef} = '1:1' and ${connections.kind} = 'thematic'`
      );
    expect(trRows.length).toBe(2);
    expect(trRows[0].reason).toBe("localized reason");
    expect(enRows.map((r) => r.toRef).sort()).toEqual(trRows.map((r) => r.toRef).sort());
    expect(trRows.every((r) => r.reviewedAt === null)).toBe(true);

    // Re-run over the same state → no new LLM calls.
    mockCallAI.mockClear();
    const rerun = await runConnectionBatch(
      {
        mode: "baseline",
        provider: "claude",
        locales: ["tr", "ru"],
        maxCalls: 500,
        maxCostUsd: 100,
      },
      hooks
    );
    expect(mockCallAI).not.toHaveBeenCalled();
    expect(rerun.generated).toBe(0);
  });

  it("topup: marks a cell exhausted when generation returns nothing new, then skips it", async () => {
    await seed("1:1");
    await seed("2:255");
    // Pre-seed one en connection so topup has an excludeRefs set.
    await db.insert(connections).values({
      fromRef: "1:1",
      toRef: "2:255",
      kind: "thematic",
      reason: "existing",
      locale: "en",
    });
    // Generation returns an empty array → nothing new.
    mockCallAI.mockResolvedValue(JSON.stringify([]));

    const first = await runConnectionBatch(
      { mode: "topup", provider: "claude", locales: [], maxCalls: 500, maxCostUsd: 100 },
      hooks
    );
    expect(first.exhausted).toBeGreaterThanOrEqual(1);

    const cov = await db
      .select()
      .from(connectionCoverage)
      .where(
        sql`${connectionCoverage.fromRef} = '1:1' and ${connectionCoverage.kind} = 'thematic'`
      );
    expect(cov).toHaveLength(1);
    expect(cov[0].exhaustedAt).not.toBeNull();

    // Second topup run → the exhausted cell is not revisited.
    mockCallAI.mockClear();
    await runConnectionBatch(
      { mode: "topup", provider: "claude", locales: [], maxCalls: 500, maxCostUsd: 100 },
      hooks
    );
    const calledForCell = mockCallAI.mock.calls.some(([p]) => String(p).includes("1:1"));
    expect(calledForCell).toBe(false);
  });

  it("spend guard: stops at maxCalls and commits completed work", async () => {
    for (const r of ["1:1", "1:2", "1:3", "2:1"]) await seed(r);
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:1", reason: "x" }]));

    const summary = await runConnectionBatch(
      { mode: "baseline", provider: "claude", locales: [], maxCalls: 1, maxCostUsd: 100 },
      hooks
    );

    expect(summary.stoppedReason).toBe("call-budget");
    expect(summary.callsUsed).toBe(1);
    // The one processed cell's rows + coverage row are committed.
    expect((await db.select().from(connections)).length).toBeGreaterThan(0);
    expect((await db.select().from(connectionCoverage)).length).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(aiGenerations)).length).toBeGreaterThanOrEqual(1);
  });

  it("spend guard: translations cannot push a cell past maxCalls", async () => {
    await seed("1:1");
    await seed("2:255");
    await seed("3:18");
    mockCallAI.mockImplementation(async (prompt: string) => {
      if (prompt.startsWith("Translate the following sentence")) return "localized reason";
      return JSON.stringify([
        { ref: "2:255", reason: "throne verse" },
        { ref: "3:18", reason: "witness of oneness" },
      ]);
    });

    const summary = await runConnectionBatch(
      { mode: "baseline", provider: "claude", locales: ["tr", "ru"], maxCalls: 1, maxCostUsd: 100 },
      hooks
    );

    // One generation call, then the budget is spent — no translation calls.
    expect(summary.callsUsed).toBe(1);
    expect(summary.stoppedReason).toBe("call-budget");
    expect(summary.translated).toBe(0);
    const translateCalls = mockCallAI.mock.calls.filter(([p]) =>
      String(p).startsWith("Translate the following sentence")
    );
    expect(translateCalls).toHaveLength(0);
    const nonEnRows = await db
      .select()
      .from(connections)
      .where(sql`${connections.locale} <> 'en'`);
    expect(nonEnRows).toHaveLength(0);
  });

  it("resumability: a second run picks up cells the budget-stopped run did not reach", async () => {
    for (const r of ["1:1", "1:2", "2:1"]) await seed(r);
    mockCallAI.mockResolvedValue(JSON.stringify([{ ref: "2:1", reason: "x" }]));

    await runConnectionBatch(
      { mode: "baseline", provider: "claude", locales: [], maxCalls: 2, maxCostUsd: 100 },
      hooks
    );
    const afterFirst = (await db.selectDistinct({ f: connections.fromRef }).from(connections))
      .length;

    await runConnectionBatch(
      { mode: "baseline", provider: "claude", locales: [], maxCalls: 500, maxCostUsd: 100 },
      hooks
    );
    const afterSecond = (await db.selectDistinct({ f: connections.fromRef }).from(connections))
      .length;
    expect(afterSecond).toBeGreaterThanOrEqual(afterFirst);
  });
});

describe("getCoverageReport (integration, real Postgres)", () => {
  it("reports missing counts, surah rollup, exhausted counts and a missing sample", async () => {
    await seed("1:1");
    await seed("1:2");
    await db.insert(connections).values([
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "r", locale: "en" },
      { fromRef: "1:1", toRef: "2:255", kind: "thematic", reason: "r-tr", locale: "tr" },
    ]);
    await db.insert(connectionCoverage).values({
      fromRef: "1:2",
      kind: "root",
      locale: "en",
      exhaustedAt: new Date(),
    });

    const report = await getCoverageReport({ kind: "thematic", locale: "en" });

    expect(report.totalVerses).toBe(6236);
    const enThematic = report.matrix.find((c) => c.kind === "thematic" && c.locale === "en")!;
    expect(enThematic.covered).toBe(1);
    expect(enThematic.missing).toBe(6235);

    const enRootExhausted = report.matrix.find((c) => c.kind === "root" && c.locale === "en")!;
    expect(enRootExhausted.exhausted).toBe(1);

    const surah1 = report.surahs.find((s) => s.surah === 1)!;
    expect(surah1.thematic).toBe(1);
    expect(report.missingSample).toContain("1:2");
    expect(report.missingSample).not.toContain("1:1");
  });
});
