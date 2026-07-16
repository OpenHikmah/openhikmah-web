import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockValues, mockInsert, mockIncr } = vi.hoisted(() => {
  const mockValues = vi.fn().mockResolvedValue(undefined);
  return {
    mockValues,
    mockInsert: vi.fn(() => ({ values: mockValues })),
    mockIncr: vi.fn(),
  };
});

vi.mock("@/lib/infra/db", () => ({ db: { insert: mockInsert } }));
vi.mock("@/lib/infra/metrics", () => ({ incr: mockIncr }));

import { logAdminAction } from "@/lib/admin/admin-audit";

describe("logAdminAction", () => {
  beforeEach(() => {
    mockValues.mockReset();
    mockValues.mockResolvedValue(undefined);
    mockInsert.mockClear();
    mockIncr.mockClear();
  });

  it("inserts a row with meta JSON-stringified normally", async () => {
    await logAdminAction({
      adminQfId: "qf-1",
      action: "flag.delete",
      meta: { key: "ai_gen_limit" },
    });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        adminQfId: "qf-1",
        action: "flag.delete",
        meta: JSON.stringify({ key: "ai_gen_limit" }),
      })
    );
  });

  it("stores null meta when meta is undefined", async () => {
    await logAdminAction({ adminQfId: "qf-1", action: "noop" });
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ meta: null }));
  });

  it("defaults targetType/targetId to null when omitted", async () => {
    await logAdminAction({ adminQfId: "qf-1", action: "noop" });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: null, targetId: null })
    );
  });

  it("serializes a BigInt in meta by converting it to a string instead of throwing", async () => {
    await logAdminAction({ adminQfId: "qf-1", action: "job.run", meta: { count: BigInt(10) } });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ meta: JSON.stringify({ count: "10" }) })
    );
  });

  it("falls back to a serializationError marker for a circular reference instead of throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const circular: any = { a: 1 };
    circular.self = circular;
    await logAdminAction({ adminQfId: "qf-1", action: "job.run", meta: circular });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ meta: JSON.stringify({ serializationError: true }) })
    );
  });

  it("swallows a db insert failure and increments a failure metric instead of throwing", async () => {
    mockValues.mockRejectedValueOnce(new Error("db down"));
    await expect(
      logAdminAction({ adminQfId: "qf-1", action: "flag.delete" })
    ).resolves.toBeUndefined();
    expect(mockIncr).toHaveBeenCalledWith("admin_audit_write_failed");
  });
});
