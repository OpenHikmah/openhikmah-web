import { describe, it, expect, vi, beforeEach } from "vitest";

function makeDbChain(resolveWith: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolveWith).then(res, rej);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));

import {
  getFlagString,
  getFlagNumber,
  getFlagBoolean,
  invalidateFlagCache,
} from "@/lib/admin/feature-flags";

function rowWith(value: unknown) {
  return [{ key: "k", value: JSON.stringify(value), updatedBy: null, updatedAt: new Date() }];
}

beforeEach(() => {
  mockSelect.mockReset();
  invalidateFlagCache();
});

describe("getFlagString", () => {
  it("returns the fallback when no row exists", async () => {
    mockSelect.mockReturnValue(makeDbChain([]));
    expect(await getFlagString("ai_provider", "claude")).toBe("claude");
  });

  it("returns the stored string value", async () => {
    mockSelect.mockReturnValue(makeDbChain(rowWith("gemini")));
    expect(await getFlagString("ai_provider", "claude")).toBe("gemini");
  });

  it("falls back when the stored value isn't a string", async () => {
    mockSelect.mockReturnValue(makeDbChain(rowWith(42)));
    expect(await getFlagString("ai_provider", "claude")).toBe("claude");
  });

  it("caches the lookup within the TTL window", async () => {
    mockSelect.mockReturnValue(makeDbChain(rowWith("gemini")));
    await getFlagString("ai_provider", "claude");
    await getFlagString("ai_provider", "claude");
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("re-queries after invalidateFlagCache", async () => {
    mockSelect.mockReturnValue(makeDbChain(rowWith("gemini")));
    await getFlagString("ai_provider", "claude");
    invalidateFlagCache("ai_provider");
    await getFlagString("ai_provider", "claude");
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });
});

describe("getFlagNumber", () => {
  it("returns the fallback when no row exists", async () => {
    mockSelect.mockReturnValue(makeDbChain([]));
    expect(await getFlagNumber("mutation_limit", 60)).toBe(60);
  });

  it("returns the stored positive number", async () => {
    mockSelect.mockReturnValue(makeDbChain(rowWith(120)));
    expect(await getFlagNumber("mutation_limit", 60)).toBe(120);
  });

  it("falls back for a non-positive or non-numeric stored value", async () => {
    mockSelect.mockReturnValue(makeDbChain(rowWith(0)));
    expect(await getFlagNumber("mutation_limit", 60)).toBe(60);
    mockSelect.mockReturnValue(makeDbChain(rowWith("nope")));
    invalidateFlagCache("mutation_limit");
    expect(await getFlagNumber("mutation_limit", 60)).toBe(60);
  });
});

describe("getFlagBoolean", () => {
  it("returns the fallback when no row exists", async () => {
    mockSelect.mockReturnValue(makeDbChain([]));
    expect(await getFlagBoolean("maintenance_mode", false)).toBe(false);
  });

  it("returns the stored boolean value", async () => {
    mockSelect.mockReturnValue(makeDbChain(rowWith(true)));
    expect(await getFlagBoolean("maintenance_mode", false)).toBe(true);
  });

  it("falls back when the stored value isn't a boolean", async () => {
    mockSelect.mockReturnValue(makeDbChain(rowWith("true")));
    expect(await getFlagBoolean("maintenance_mode", false)).toBe(false);
  });
});
