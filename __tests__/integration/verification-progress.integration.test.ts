import { describe, it, expect, beforeEach, vi } from "vitest";

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
import { getVerificationProgress, toProgress } from "@/lib/ai/verification-progress";
import { runVerifyBatch } from "@/lib/ai/connection-verify-batch";
import { isVerificationPrompt } from "../test-utils/verification";

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

async function seedConnection(
  fromRef: string,
  toRef: string,
  kind: "thematic" | "root" | "contrast" = "thematic",
  locale = "en",
  status = "active"
) {
  await db.insert(connections).values({
    fromRef,
    toRef,
    kind,
    reason: `reason ${fromRef}->${toRef}`,
    locale,
    model: "claude-opus-4-7",
    status,
  });
}

async function markVerified(fromRef: string, kind: string) {
  await db
    .insert(connectionCoverage)
    .values({ fromRef, kind, locale: "en", activeCount: 1, verifiedAt: new Date() });
}

/** Approves every ref named in the verification prompt. */
function approveAll() {
  mockCallAI.mockImplementation(async (prompt: string) => {
    if (!isVerificationPrompt(prompt)) throw new Error("unexpected prompt");
    const refs = [...prompt.matchAll(/^- (\d+:\d+): /gm)].map((m) => m[1]);
    return JSON.stringify(refs.map((ref) => ({ ref, valid: true })));
  });
}

beforeEach(async () => {
  mockCallAI.mockReset();
  await db.delete(connectionCoverage);
  await db.delete(connections);
  await db.delete(aiGenerations);
  await db.delete(verses);
  for (const ref of ["1:1", "2:255", "3:18", "112:1"]) await seedVerse(ref);
});

describe("toProgress", () => {
  it("computes remaining and a one-decimal percent, and treats an empty backlog as complete", () => {
    expect(toProgress(18708, 3812)).toEqual({
      total: 18708,
      done: 3812,
      remaining: 14896,
      percent: 20.4,
    });
    expect(toProgress(0, 0)).toEqual({ total: 0, done: 0, remaining: 0, percent: 100 });
    expect(toProgress(3, 3).percent).toBe(100);
  });
});

describe("getVerificationProgress (integration, real Postgres)", () => {
  it("is complete when there is nothing to verify", async () => {
    const p = await getVerificationProgress();
    expect(p.connections).toEqual({ total: 0, done: 0, remaining: 0, percent: 100 });
    expect(p.verses.percent).toBe(100);
  });

  it("counts verses, cells and connections, using only active English rows", async () => {
    // 1:1 thematic: 2 connections, verified. 1:1 root: 1 connection, not verified.
    await seedConnection("1:1", "2:255");
    await seedConnection("1:1", "3:18");
    await seedConnection("1:1", "112:1", "root");
    // 2:255 thematic: 3 connections, no coverage row at all (never verified).
    await seedConnection("2:255", "1:1");
    await seedConnection("2:255", "3:18");
    await seedConnection("2:255", "112:1");
    // Ignored: a translation, a flagged row, a retired row.
    await seedConnection("1:1", "2:255", "thematic", "tr");
    await seedConnection("3:18", "1:1", "thematic", "en", "flagged");
    await seedConnection("3:18", "2:255", "thematic", "en", "retired");
    await markVerified("1:1", "thematic");

    const p = await getVerificationProgress();

    expect(p.cells).toEqual(toProgress(3, 1));
    expect(p.connections).toEqual(toProgress(6, 2));
    // Neither verse is fully verified: 1:1 still has an unverified root cell.
    expect(p.verses).toEqual(toProgress(2, 0));
  });

  it("counts a verse as verified only once every one of its cells is", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("1:1", "3:18", "root");
    await seedConnection("2:255", "1:1");
    await markVerified("1:1", "thematic");
    await markVerified("1:1", "root");

    const p = await getVerificationProgress();

    expect(p.verses).toEqual(toProgress(2, 1));
    expect(p.cells).toEqual(toProgress(3, 2));
  });

  it("is not thrown off by a coverage row that is not verified yet (a failed attempt)", async () => {
    await seedConnection("1:1", "2:255");
    await db.insert(connectionCoverage).values({
      fromRef: "1:1",
      kind: "thematic",
      locale: "en",
      activeCount: 1,
      lastError: "503",
    });
    const p = await getVerificationProgress();
    expect(p.cells).toEqual(toProgress(1, 0));
  });
});

describe("runVerifyBatch progress logging (integration, real Postgres)", () => {
  it("logs the whole-backlog progress at the start and the end, with the percent and what remains", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("2:255", "3:18");
    await seedConnection("3:18", "112:1");
    approveAll();
    const lines: string[] = [];

    await runVerifyBatch(
      { provider: "claude", maxCalls: 500, maxCostUsd: 100 },
      { onProgress: (l) => lines.push(l) }
    );

    const progress = lines.filter((l) => l.includes("] progress:"));
    expect(progress[0]).toContain(
      "0/3 verses (0%) | 0/3 connections (0%) | 3 connections remaining"
    );
    expect(progress[progress.length - 1]).toContain(
      "3/3 verses (100%) | 3/3 connections (100%) | 0 connections remaining"
    );
  });

  it("reflects a partial run: a budget stop leaves the remaining count in the final line", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("2:255", "3:18");
    await seedConnection("3:18", "112:1");
    approveAll();
    const lines: string[] = [];

    await runVerifyBatch(
      { provider: "claude", maxCalls: 1, maxCostUsd: 100 },
      { onProgress: (l) => lines.push(l) }
    );

    const last = lines.filter((l) => l.includes("] progress:")).pop();
    expect(last).toContain(
      "1/3 verses (33.3%) | 1/3 connections (33.3%) | 2 connections remaining"
    );
  });

  it("does not stop the run when the progress lookup fails", async () => {
    await seedConnection("1:1", "2:255");
    approveAll();
    const progress = await import("@/lib/ai/verification-progress");
    const spy = vi.spyOn(progress, "getVerificationProgress").mockRejectedValue(new Error("db"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await runVerifyBatch(
      { provider: "claude", maxCalls: 500, maxCostUsd: 100 },
      { onProgress: () => {} }
    );

    spy.mockRestore();
    errSpy.mockRestore();
    expect(summary.stoppedReason).toBe("completed");
    expect(summary.cellsVerified).toBe(1);
  });
});
