import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";

// Real Postgres (Testcontainers); only the LLM calls and pacing sleeps are mocked.
// Each translation check is two callAI calls: a blind back-translation, then a comparison.
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
import { runTranslationVerifyBatch } from "@/lib/ai/translation-verify-batch";
import { getTranslationProgress } from "@/lib/ai/verification-progress";
import { GeminiDailyQuotaError } from "@/lib/ai/gemini-errors";

const hooks = { onProgress: () => {} };
const OPTS = { provider: "claude" as const, maxCalls: 500, maxCostUsd: 100 };
const ARABIC = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";

async function seedVerse(ref: string) {
  const [s, a] = ref.split(":");
  await db.insert(verses).values({
    ref,
    surah: Number(s),
    ayah: Number(a),
    arabicText: ARABIC,
    translation: `text-${ref}`,
  });
}

async function seedPair(
  fromRef: string,
  toRef: string,
  locales: string[] = ["tr", "ru", "az"],
  enStatus = "active"
) {
  await db.insert(connections).values({
    fromRef,
    toRef,
    kind: "thematic",
    reason: `English reason ${fromRef} ${toRef}`,
    locale: "en",
    model: "claude-opus-4-7",
    status: enStatus,
  });
  for (const locale of locales) {
    await db.insert(connections).values({
      fromRef,
      toRef,
      kind: "thematic",
      reason: `Localized reason ${locale} ${fromRef} ${toRef}`,
      locale,
      model: "claude-opus-4-7",
    });
  }
}

/** Faithful by default; `driftMarker` in a localized text makes its check come back as drift. */
function checker(driftMarker?: string) {
  mockCallAI.mockImplementation(async (prompt: string) => {
    const drifting = driftMarker !== undefined && prompt.includes(driftMarker);
    if (prompt.startsWith("Render the following")) {
      return drifting ? "drifted text" : "A faithful rendering.";
    }
    return JSON.stringify({ same: !prompt.includes("drifted text") });
  });
}

const rowOf = async (fromRef: string, toRef: string, locale: string) =>
  (
    await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.fromRef, fromRef),
          eq(connections.toRef, toRef),
          eq(connections.locale, locale)
        )
      )
  )[0];

beforeEach(async () => {
  mockCallAI.mockReset();
  await db.delete(connectionCoverage);
  await db.delete(connections);
  await db.delete(aiGenerations);
  await db.delete(verses);
  for (const ref of ["1:1", "2:255", "3:18", "112:1"]) await seedVerse(ref);
});

describe("runTranslationVerifyBatch (integration, real Postgres)", () => {
  it("checks every translated row with two calls each, stamps them and leaves approved ones active", async () => {
    await seedPair("1:1", "2:255");
    checker();

    const summary = await runTranslationVerifyBatch(OPTS, hooks);

    expect(summary).toMatchObject({
      stoppedReason: "completed",
      workListSize: 3,
      cellsVerified: 3,
      rowsFlagged: 0,
      cellsFailed: 0,
      callsUsed: 6,
    });
    for (const locale of ["tr", "ru", "az"]) {
      const row = await rowOf("1:1", "2:255", locale);
      expect(row.status).toBe("active");
      expect(row.translationCheckedAt).toBeInstanceOf(Date);
    }
    expect((await rowOf("1:1", "2:255", "en")).translationCheckedAt).toBeNull();
  });

  it("flags only the translation whose meaning drifted, in its own locale, and leaves it pending review", async () => {
    await seedPair("1:1", "2:255");
    checker("Localized reason ru");

    const summary = await runTranslationVerifyBatch(OPTS, hooks);

    expect(summary).toMatchObject({ cellsVerified: 3, rowsFlagged: 1, cellsFailed: 0 });
    const ru = await rowOf("1:1", "2:255", "ru");
    expect(ru.status).toBe("flagged");
    expect(ru.translationCheckedAt).toBeInstanceOf(Date);
    expect(ru.reviewedAt).toBeNull();
    expect((await rowOf("1:1", "2:255", "tr")).status).toBe("active");
    expect((await rowOf("1:1", "2:255", "az")).status).toBe("active");
    expect((await rowOf("1:1", "2:255", "en")).status).toBe("active");
  });

  it("does not flag a restored false positive again on the next run", async () => {
    await seedPair("1:1", "2:255", ["ru"]);
    checker("Localized reason ru");
    await runTranslationVerifyBatch(OPTS, hooks);
    await db.update(connections).set({ status: "active" }).where(eq(connections.locale, "ru"));
    mockCallAI.mockClear();

    const second = await runTranslationVerifyBatch(OPTS, hooks);

    expect(second.workListSize).toBe(0);
    expect(mockCallAI).not.toHaveBeenCalled();
    expect((await rowOf("1:1", "2:255", "ru")).status).toBe("active");
  });

  it("flags a translation with no active English reason, without any LLM call", async () => {
    await seedPair("1:1", "2:255", ["tr"], "flagged");
    checker();

    const summary = await runTranslationVerifyBatch(OPTS, hooks);

    expect(summary).toMatchObject({ cellsVerified: 1, rowsFlagged: 1, callsUsed: 0 });
    expect(mockCallAI).not.toHaveBeenCalled();
    const tr = await rowOf("1:1", "2:255", "tr");
    expect(tr.status).toBe("flagged");
    expect(tr.translationCheckedAt).toBeInstanceOf(Date);
  });

  it("skips rows already checked, flagged or retired", async () => {
    await seedPair("1:1", "2:255", ["tr", "ru", "az"]);
    await db
      .update(connections)
      .set({ translationCheckedAt: new Date() })
      .where(eq(connections.locale, "tr"));
    await db.update(connections).set({ status: "flagged" }).where(eq(connections.locale, "ru"));
    await db.update(connections).set({ status: "retired" }).where(eq(connections.locale, "az"));
    checker();

    const summary = await runTranslationVerifyBatch(OPTS, hooks);

    expect(summary.workListSize).toBe(0);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("an upstream error leaves the row unstamped and active, counted as failed, and a later run retries it", async () => {
    await seedPair("1:1", "2:255", ["tr"]);
    mockCallAI.mockRejectedValue(new Error("503 upstream"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await runTranslationVerifyBatch(OPTS, hooks);
    errSpy.mockRestore();

    expect(summary.cellsVerified).toBe(0);
    expect(summary.cellsFailed).toBe(1);
    expect(summary.stoppedReason).toBe("error");
    const tr = await rowOf("1:1", "2:255", "tr");
    expect(tr.status).toBe("active");
    expect(tr.translationCheckedAt).toBeNull();

    checker();
    const retry = await runTranslationVerifyBatch(OPTS, hooks);
    expect(retry).toMatchObject({ workListSize: 1, cellsVerified: 1 });
    expect((await rowOf("1:1", "2:255", "tr")).translationCheckedAt).toBeInstanceOf(Date);
  });

  it("an inconclusive verdict is never treated as approval or as drift", async () => {
    await seedPair("1:1", "2:255", ["tr"]);
    mockCallAI.mockImplementation(async (prompt: string) =>
      prompt.startsWith("Render the following") ? "A faithful rendering." : "Looks the same to me."
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await runTranslationVerifyBatch(OPTS, hooks);
    errSpy.mockRestore();

    expect(summary).toMatchObject({ cellsVerified: 0, cellsFailed: 1, rowsFlagged: 0 });
    const tr = await rowOf("1:1", "2:255", "tr");
    expect(tr.status).toBe("active");
    expect(tr.translationCheckedAt).toBeNull();
  });

  it("stops before a row it cannot finish within the call budget, and resumes", async () => {
    await seedPair("1:1", "2:255");
    checker();

    const first = await runTranslationVerifyBatch({ ...OPTS, maxCalls: 3 }, hooks);

    expect(first).toMatchObject({
      stoppedReason: "call-budget",
      callsUsed: 2,
      cellsVerified: 1,
      cellsFailed: 0,
    });

    const resumed = await runTranslationVerifyBatch(OPTS, hooks);
    expect(resumed).toMatchObject({ workListSize: 2, cellsVerified: 2 });
  });

  it("a Gemini daily quota ends the run as quota-daily without a failed row or a stamp", async () => {
    await seedPair("1:1", "2:255", ["tr"]);
    mockCallAI.mockRejectedValue(
      new GeminiDailyQuotaError({ cls: "daily", retryAfterMs: null, message: "quota" } as never)
    );

    const summary = await runTranslationVerifyBatch({ ...OPTS, provider: "gemini" }, hooks);

    expect(summary.stoppedReason).toBe("quota-daily");
    expect(summary.cellsFailed).toBe(0);
    expect((await rowOf("1:1", "2:255", "tr")).translationCheckedAt).toBeNull();
  });

  it("does no work when already cancelled", async () => {
    await seedPair("1:1", "2:255", ["tr"]);
    checker();
    const controller = new AbortController();
    controller.abort();

    const summary = await runTranslationVerifyBatch(OPTS, hooks, controller.signal);

    expect(summary.stoppedReason).toBe("cancelled");
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("logs the progress at the start and the end, with the percent and what remains", async () => {
    await seedPair("1:1", "2:255", ["tr", "ru"]);
    checker();
    const lines: string[] = [];

    await runTranslationVerifyBatch(OPTS, { onProgress: (l) => lines.push(l) });

    const progress = lines.filter((l) => l.includes("] progress:"));
    expect(progress[0]).toContain("0/2 translations (0%)");
    expect(progress[0]).toContain("2 remaining");
    expect(progress[progress.length - 1]).toContain("2/2 translations (100%)");
    expect(progress[progress.length - 1]).toContain("0 remaining");
  });
});

describe("getTranslationProgress (integration, real Postgres)", () => {
  it("is complete when there are no translations", async () => {
    const p = await getTranslationProgress();
    expect(p.rows).toEqual({ total: 0, done: 0, remaining: 0, percent: 100 });
    expect(p.byLocale).toEqual({});
  });

  it("counts active translated rows overall and per locale, ignoring English and flagged rows", async () => {
    await seedPair("1:1", "2:255", ["tr", "ru"]);
    await seedPair("3:18", "112:1", ["tr"]);
    await db
      .update(connections)
      .set({ translationCheckedAt: new Date() })
      .where(and(eq(connections.locale, "tr"), eq(connections.fromRef, "1:1")));
    await db
      .update(connections)
      .set({ status: "flagged" })
      .where(and(eq(connections.locale, "tr"), eq(connections.fromRef, "3:18")));

    const p = await getTranslationProgress();

    expect(p.rows).toEqual({ total: 2, done: 1, remaining: 1, percent: 50 });
    expect(p.byLocale.tr).toEqual({ total: 1, done: 1, remaining: 0, percent: 100 });
    expect(p.byLocale.ru).toEqual({ total: 1, done: 0, remaining: 1, percent: 0 });
  });
});
