import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect, mockInsert, values, onConflictDoUpdate } = vi.hoisted(() => {
  const onConflictDoUpdate = vi
    .fn<(arg: { target: unknown[]; set: Record<string, unknown> }) => Promise<void>>()
    .mockResolvedValue(undefined);
  const values = vi.fn((_row: Record<string, unknown>) => ({ onConflictDoUpdate }));
  return {
    mockSelect: vi.fn(),
    mockInsert: vi.fn(() => ({ values })),
    values,
    onConflictDoUpdate,
  };
});

vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect, insert: mockInsert } }));

import { markCellVerified } from "@/lib/ai/connection-verified";
import { connectionCoverage } from "@/lib/infra/db/schema";

function activeCount(n: number) {
  mockSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve([{ count: n }]) }) });
}

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockClear();
  values.mockClear();
  onConflictDoUpdate.mockClear();
});

describe("markCellVerified", () => {
  it("stamps the cell as verified, seeding activeCount from the real active English rows", async () => {
    activeCount(4);
    const at = new Date("2026-10-27T10:00:00Z");
    await markCellVerified("2:255", "thematic", at);

    expect(mockInsert).toHaveBeenCalledWith(connectionCoverage);
    expect(values).toHaveBeenCalledWith({
      fromRef: "2:255",
      kind: "thematic",
      locale: "en",
      activeCount: 4,
      verifiedAt: at,
      updatedAt: at,
    });
  });

  it("on conflict only refreshes the timestamps, keeping the existing row's other fields", async () => {
    activeCount(1);
    const at = new Date("2026-10-27T10:00:00Z");
    await markCellVerified("112:1", "root", at);

    const conflict = onConflictDoUpdate.mock.calls[0][0];
    expect(conflict.set).toEqual({ verifiedAt: at, updatedAt: at });
    expect(conflict.target).toEqual([
      connectionCoverage.fromRef,
      connectionCoverage.kind,
      connectionCoverage.locale,
    ]);
  });

  it("records a zero count for a cell with no active connections", async () => {
    activeCount(0);
    await markCellVerified("1:1", "contrast");
    expect(values.mock.calls[0][0]).toMatchObject({ activeCount: 0 });
  });

  it("defaults the timestamp to now", async () => {
    activeCount(2);
    const before = Date.now();
    await markCellVerified("1:1", "thematic");
    const stamped = (values.mock.calls[0][0].verifiedAt as Date).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it("does not write when the count query fails", async () => {
    mockSelect.mockReturnValue({
      from: () => ({ where: () => Promise.reject(new Error("db down")) }),
    });
    await expect(markCellVerified("1:1", "thematic")).rejects.toThrow("db down");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
