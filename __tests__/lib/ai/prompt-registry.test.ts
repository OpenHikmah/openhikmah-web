import { describe, it, expect, vi, beforeEach } from "vitest";

const limitMock = vi.fn(() => Promise.resolve([] as unknown[]));
vi.mock("@/lib/infra/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: limitMock }) }) }) }),
  },
}));

import { getPrompt, renderTemplate, invalidatePromptCache } from "@/lib/ai/prompt-registry";

describe("getPrompt", () => {
  beforeEach(() => {
    limitMock.mockReset();
    limitMock.mockResolvedValue([]);
    invalidatePromptCache();
  });

  it("falls back to the hardcoded template when no active DB version exists", async () => {
    const result = await getPrompt("connection.legacy", "fallback template");
    expect(result).toEqual({ template: "fallback template", version: null });
  });

  it("uses the active DB-stored template when one exists", async () => {
    limitMock.mockResolvedValue([{ id: 7, template: "db template", key: "connection.legacy" }]);
    const result = await getPrompt("connection.legacy", "fallback template");
    expect(result).toEqual({ template: "db template", version: 7 });
  });

  it("caches the resolved value so a second call within the TTL skips the db", async () => {
    limitMock.mockResolvedValue([{ id: 7, template: "db template" }]);
    await getPrompt("connection.legacy", "fallback");
    await getPrompt("connection.legacy", "fallback");
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it("caches per-key independently", async () => {
    limitMock.mockResolvedValue([]);
    await getPrompt("connection.legacy", "fallback a");
    await getPrompt("connection.selection", "fallback b");
    expect(limitMock).toHaveBeenCalledTimes(2);
  });

  it("invalidatePromptCache(key) forces the next call for that key to re-query", async () => {
    limitMock.mockResolvedValue([]);
    await getPrompt("connection.legacy", "fallback");
    invalidatePromptCache("connection.legacy");
    await getPrompt("connection.legacy", "fallback");
    expect(limitMock).toHaveBeenCalledTimes(2);
  });

  it("invalidatePromptCache() with no key clears every cached key", async () => {
    limitMock.mockResolvedValue([]);
    await getPrompt("connection.legacy", "fallback");
    await getPrompt("connection.selection", "fallback");
    invalidatePromptCache();
    await getPrompt("connection.legacy", "fallback");
    await getPrompt("connection.selection", "fallback");
    expect(limitMock).toHaveBeenCalledTimes(4);
  });
});

describe("renderTemplate", () => {
  it("fills known placeholders from vars", () => {
    expect(renderTemplate("Hello {{name}}, welcome to {{place}}.", { name: "A", place: "B" })).toBe(
      "Hello A, welcome to B."
    );
  });

  it("renders unknown placeholders as empty", () => {
    expect(renderTemplate("Hi {{missing}}!", {})).toBe("Hi !");
  });

  it("returns the template unchanged when there are no placeholders", () => {
    expect(renderTemplate("no placeholders here", { name: "A" })).toBe("no placeholders here");
  });
});
