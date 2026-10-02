import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";

// Real Postgres (Testcontainers); only the LLM call and pacing sleeps are mocked.
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
const { mockSleep } = vi.hoisted(() => ({
  mockSleep: vi.fn(async (_ms: number, _signal?: AbortSignal): Promise<void> => {}),
}));
vi.mock("@/lib/infra/sleep", () => ({
  interruptibleSleep: (ms: number, signal?: AbortSignal) => mockSleep(ms, signal),
}));

import { db } from "@/lib/infra/db";
import { verses, connections, connectionCoverage, aiGenerations } from "@/lib/infra/db/schema";
import { runVerifyBatch } from "@/lib/ai/connection-verify-batch";
import { GeminiDailyQuotaError } from "@/lib/ai/gemini-errors";
import { isVerificationPrompt } from "../test-utils/verification";

const hooks = { onProgress: () => {} };
const OPTS = { provider: "claude" as const, maxCalls: 500, maxCostUsd: 100 };

// Plausible Arabic even in fixtures (AGENTS.md): Al-Fatiha 1:1.
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
    reason: locale === "en" ? `reason ${fromRef}->${toRef}` : `localized ${fromRef}->${toRef}`,
    locale,
    model: "claude-opus-4-7",
    status,
  });
}

/** Verdicts for the refs named in the verification prompt: valid unless listed in `reject`. */
function verifier(reject: string[] = [], omit: string[] = []) {
  mockCallAI.mockImplementation(async (prompt: string) => {
    if (!isVerificationPrompt(prompt)) throw new Error("unexpected non-verification prompt");
    const refs = [...prompt.matchAll(/^- (\d+:\d+): /gm)].map((m) => m[1]);
    return JSON.stringify(
      refs.filter((r) => !omit.includes(r)).map((ref) => ({ ref, valid: !reject.includes(ref) }))
    );
  });
}

const statusOf = async (fromRef: string, toRef: string, locale: string) =>
  (
    await db
      .select({ status: connections.status })
      .from(connections)
      .where(
        and(
          eq(connections.fromRef, fromRef),
          eq(connections.toRef, toRef),
          eq(connections.locale, locale)
        )
      )
  )[0]?.status;

const coverageOf = async (fromRef: string, kind = "thematic") =>
  (
    await db
      .select()
      .from(connectionCoverage)
      .where(
        and(
          eq(connectionCoverage.fromRef, fromRef),
          eq(connectionCoverage.kind, kind),
          eq(connectionCoverage.locale, "en")
        )
      )
  )[0];

beforeEach(async () => {
  mockCallAI.mockReset();
  mockSleep.mockClear();
  await db.delete(connectionCoverage);
  await db.delete(connections);
  await db.delete(aiGenerations);
  await db.delete(verses);
  for (const ref of ["1:1", "2:255", "3:18", "112:1"]) await seedVerse(ref);
});

describe("runVerifyBatch (integration, real Postgres)", () => {
  it("flags a rejected connection in every locale, keeps the approved one, and stamps the cell", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("1:1", "3:18");
    await seedConnection("1:1", "2:255", "thematic", "tr");
    await seedConnection("1:1", "3:18", "thematic", "tr");
    verifier(["3:18"]);

    const summary = await runVerifyBatch(OPTS, hooks);

    expect(summary).toMatchObject({
      stoppedReason: "completed",
      cellsVerified: 1,
      rowsFlagged: 1,
      cellsFailed: 0,
      callsUsed: 1,
    });
    expect(await statusOf("1:1", "2:255", "en")).toBe("active");
    expect(await statusOf("1:1", "2:255", "tr")).toBe("active");
    // Nothing cascades, so the rejected pair is flagged in the translation too.
    expect(await statusOf("1:1", "3:18", "en")).toBe("flagged");
    expect(await statusOf("1:1", "3:18", "tr")).toBe("flagged");
    // Flagged rows wait in the admin review queue: reviewedAt stays unset.
    const flagged = await db.select().from(connections).where(eq(connections.status, "flagged"));
    expect(flagged.every((r) => r.reviewedAt === null)).toBe(true);

    const cov = await coverageOf("1:1");
    expect(cov.verifiedAt).toBeInstanceOf(Date);
    expect(cov.activeCount).toBe(1);
    expect(cov.exhaustedAt).toBeNull();
  });

  it("keeps a connection only on explicit approval: an unmentioned ref is flagged too", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("1:1", "3:18");
    verifier([], ["3:18"]);

    const summary = await runVerifyBatch(OPTS, hooks);

    expect(summary.rowsFlagged).toBe(1);
    expect(await statusOf("1:1", "2:255", "en")).toBe("active");
    expect(await statusOf("1:1", "3:18", "en")).toBe("flagged");
  });

  it("clears an exhausted marker when it flags something, so a top-up can refill the cell", async () => {
    await seedConnection("1:1", "2:255");
    await db.insert(connectionCoverage).values({
      fromRef: "1:1",
      kind: "thematic",
      locale: "en",
      activeCount: 1,
      exhaustedAt: new Date(),
    });
    verifier(["2:255"]);

    await runVerifyBatch(OPTS, hooks);

    const cov = await coverageOf("1:1");
    expect(cov.exhaustedAt).toBeNull();
    expect(cov.activeCount).toBe(0);
    expect(cov.verifiedAt).toBeInstanceOf(Date);
  });

  it("skips cells already stamped verified, and is resumable: a second run does no work", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("2:255", "3:18", "root");
    await db.insert(connectionCoverage).values({
      fromRef: "1:1",
      kind: "thematic",
      locale: "en",
      activeCount: 1,
      verifiedAt: new Date(),
    });
    verifier(["3:18"]);

    const first = await runVerifyBatch(OPTS, hooks);
    expect(first.workListSize).toBe(1);
    expect(first.cellsVerified).toBe(1);
    expect(await statusOf("1:1", "2:255", "en")).toBe("active");
    expect(await statusOf("2:255", "3:18", "en")).toBe("flagged");

    mockCallAI.mockClear();
    const second = await runVerifyBatch(OPTS, hooks);
    expect(second.workListSize).toBe(0);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("ignores non-English and already flagged or retired rows when building the work list", async () => {
    await seedConnection("1:1", "2:255", "thematic", "tr");
    await seedConnection("1:1", "3:18", "thematic", "en", "flagged");
    await seedConnection("1:1", "112:1", "thematic", "en", "retired");
    verifier();

    const summary = await runVerifyBatch(OPTS, hooks);

    expect(summary.workListSize).toBe(0);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("a verifier error leaves the cell untouched and unstamped, records it, and a later run verifies it", async () => {
    await seedConnection("1:1", "2:255");
    mockCallAI.mockRejectedValue(new Error("503 verifier unavailable"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const failed = await runVerifyBatch(OPTS, hooks);
    errSpy.mockRestore();

    expect(failed.cellsVerified).toBe(0);
    expect(failed.cellsFailed).toBe(1);
    expect(failed.stoppedReason).toBe("error");
    expect(await statusOf("1:1", "2:255", "en")).toBe("active");
    const cov = await coverageOf("1:1");
    expect(cov.verifiedAt).toBeNull();
    expect(cov.lastError).toContain("503 verifier unavailable");

    verifier();
    const retry = await runVerifyBatch(OPTS, hooks);
    expect(retry.cellsVerified).toBe(1);
    expect((await coverageOf("1:1")).verifiedAt).toBeInstanceOf(Date);
    expect((await coverageOf("1:1")).lastError).toBeNull();
  });

  it("an unparseable verifier reply is a failed cell, never an approval", async () => {
    await seedConnection("1:1", "2:255");
    mockCallAI.mockResolvedValue("I refuse to review this.");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await runVerifyBatch(OPTS, hooks);
    errSpy.mockRestore();

    expect(summary.cellsVerified).toBe(0);
    expect(summary.cellsFailed).toBe(1);
    expect(await statusOf("1:1", "2:255", "en")).toBe("active");
    expect((await coverageOf("1:1")).verifiedAt).toBeNull();
  });

  it("stops cleanly at the call budget, leaving the unreached cells unstamped for the next run", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("2:255", "3:18");
    await seedConnection("3:18", "112:1");
    verifier();

    const summary = await runVerifyBatch({ ...OPTS, maxCalls: 2 }, hooks);

    expect(summary.stoppedReason).toBe("call-budget");
    expect(summary.callsUsed).toBe(2);
    expect(summary.cellsVerified).toBe(2);
    expect(summary.cellsFailed).toBe(0);
    expect((await coverageOf("1:1")).verifiedAt).toBeInstanceOf(Date);
    expect((await coverageOf("2:255")).verifiedAt).toBeInstanceOf(Date);
    expect(await coverageOf("3:18")).toBeUndefined();

    // Resume: only the remaining cell is done.
    const resumed = await runVerifyBatch(OPTS, hooks);
    expect(resumed.workListSize).toBe(1);
    expect(resumed.cellsVerified).toBe(1);
  });

  it("stops at the cost budget before making a call it cannot afford", async () => {
    await seedConnection("1:1", "2:255");
    verifier();
    const summary = await runVerifyBatch({ ...OPTS, maxCostUsd: 0.0000001 }, hooks);
    expect(summary.stoppedReason).toBe("cost-budget");
    expect(mockCallAI).not.toHaveBeenCalled();
    expect((await coverageOf("1:1"))?.verifiedAt ?? null).toBeNull();
  });

  it("a Gemini daily quota ends the run as quota-daily without counting a failed cell or stamping", async () => {
    await seedConnection("1:1", "2:255");
    mockCallAI.mockRejectedValue(
      new GeminiDailyQuotaError({ cls: "daily", retryAfterMs: null, message: "quota" } as never)
    );

    const summary = await runVerifyBatch({ ...OPTS, provider: "gemini" }, hooks);

    expect(summary.stoppedReason).toBe("quota-daily");
    expect(summary.cellsFailed).toBe(0);
    expect((await coverageOf("1:1"))?.verifiedAt ?? null).toBeNull();
  });

  it("stops when the signal is already aborted, doing no work", async () => {
    await seedConnection("1:1", "2:255");
    verifier();
    const controller = new AbortController();
    controller.abort();
    const summary = await runVerifyBatch(OPTS, hooks, controller.signal);
    expect(summary.stoppedReason).toBe("cancelled");
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("flags a connection whose target verse is not in the corpus, without sending it to the verifier", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("1:1", "50:45"); // 50:45 is a real ref that was never seeded
    verifier();

    const summary = await runVerifyBatch(OPTS, hooks);

    expect(summary.rowsFlagged).toBe(1);
    expect(await statusOf("1:1", "50:45", "en")).toBe("flagged");
    expect(await statusOf("1:1", "2:255", "en")).toBe("active");
    const prompt = mockCallAI.mock.calls[0][0] as string;
    expect(prompt).not.toContain("50:45");
  });

  it("fails a cell whose source verse is not in the corpus instead of approving it", async () => {
    await seedConnection("50:45", "2:255");
    verifier();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const summary = await runVerifyBatch(OPTS, hooks);
    errSpy.mockRestore();
    expect(summary.cellsFailed).toBe(1);
    expect(await statusOf("50:45", "2:255", "en")).toBe("active");
    expect((await coverageOf("50:45")).verifiedAt).toBeNull();
  });

  it("spaces consecutive verification calls with the configured delay", async () => {
    await seedConnection("1:1", "2:255");
    await seedConnection("2:255", "3:18");
    await seedConnection("3:18", "112:1");
    verifier();
    await runVerifyBatch({ ...OPTS, callDelayMs: 1500 }, hooks);
    expect(mockCallAI).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenCalledWith(1500, undefined);
  });
});
