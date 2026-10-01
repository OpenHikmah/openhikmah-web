import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/infra/db", () => ({ db: {} }));

import { MAX_SHARE_EDGES, MAX_SHARE_NODES, parseSharePayload } from "@/lib/canvas/share-canvas";

const node = (id: string, ref = "2:255") => ({ id, x: 10, y: 20, ref });
const edge = (id: string, source: string, target: string, kind = "thematic") => ({
  id,
  source,
  target,
  kind,
});
const payload = (overrides: Record<string, unknown> = {}) => ({
  v: 2,
  nodes: [node("node-1"), node("node-2", "112:1")],
  edges: [edge("edge-1", "node-1", "node-2")],
  ...overrides,
});

describe("parseSharePayload", () => {
  it("accepts a well-formed payload", () => {
    const result = parseSharePayload(payload());
    expect(result).toEqual({ ok: true, payload: payload() });
  });

  it("accepts an empty edges array and keeps isRoot", () => {
    const result = parseSharePayload(
      payload({ nodes: [{ ...node("node-1"), isRoot: true }], edges: [] })
    );
    expect(result).toEqual({
      ok: true,
      payload: { v: 2, nodes: [{ ...node("node-1"), isRoot: true }], edges: [] },
    });
  });

  it("drops forged verse text and edge reasons instead of keeping them", () => {
    const result = parseSharePayload(
      payload({
        nodes: [
          {
            ...node("node-1"),
            arabicText: "forged arabic",
            translation: "forged translation",
            verse: { ref: "2:255", translation: "forged" },
          },
          node("node-2", "112:1"),
        ],
        edges: [{ ...edge("edge-1", "node-1", "node-2"), reason: "forged", label: "forged" }],
        extra: "ignored",
      })
    );
    expect(result).toEqual({ ok: true, payload: payload() });
  });

  it.each([
    ["a non-object", "nope"],
    ["null", null],
    ["the old v1 format", { v: 1, nodes: [{ verse: { ref: "2:255" } }] }],
    ["an unknown version", payload({ v: 3 })],
  ])("rejects %s", (_label, input) => {
    expect(parseSharePayload(input).ok).toBe(false);
  });

  it("rejects missing, non-array and oversized edges", () => {
    expect(parseSharePayload({ v: 2, nodes: [node("node-1")] }).ok).toBe(false);
    expect(parseSharePayload(payload({ edges: {} })).ok).toBe(false);
    const edges = Array.from({ length: MAX_SHARE_EDGES + 1 }, (_, i) =>
      edge(`e${i}`, "node-1", "node-2")
    );
    expect(parseSharePayload(payload({ edges })).ok).toBe(false);
  });

  it("rejects empty and oversized node lists", () => {
    expect(parseSharePayload(payload({ nodes: [], edges: [] })).ok).toBe(false);
    const nodes = Array.from({ length: MAX_SHARE_NODES + 1 }, (_, i) => node(`n${i}`));
    expect(parseSharePayload(payload({ nodes, edges: [] })).ok).toBe(false);
    const max = Array.from({ length: MAX_SHARE_NODES }, (_, i) => node(`n${i}`));
    expect(parseSharePayload(payload({ nodes: max, edges: [] })).ok).toBe(true);
  });

  it.each(["", "foo", "0:1", "1:8", "115:1", "2:0", "02:255", "2:255 "])(
    "rejects the invalid verse ref %j",
    (ref) => {
      expect(parseSharePayload(payload({ nodes: [node("node-1", ref)], edges: [] })).ok).toBe(
        false
      );
    }
  );

  it("rejects a non-string ref", () => {
    expect(
      parseSharePayload(payload({ nodes: [{ ...node("node-1"), ref: 2255 }], edges: [] })).ok
    ).toBe(false);
  });

  it("rejects bad node ids and duplicate node ids", () => {
    for (const id of ["", "has space", "<script>", "a".repeat(129), 5]) {
      expect(parseSharePayload(payload({ nodes: [{ ...node("x"), id }], edges: [] })).ok).toBe(
        false
      );
    }
    expect(
      parseSharePayload(payload({ nodes: [node("node-1"), node("node-1")], edges: [] })).ok
    ).toBe(false);
  });

  it("rejects non-finite or out-of-range coordinates", () => {
    for (const bad of [Infinity, -Infinity, NaN, "10", null, 1e9]) {
      expect(
        parseSharePayload(payload({ nodes: [{ ...node("node-1"), x: bad }], edges: [] })).ok
      ).toBe(false);
      expect(
        parseSharePayload(payload({ nodes: [{ ...node("node-1"), y: bad }], edges: [] })).ok
      ).toBe(false);
    }
  });

  it("rejects a non-boolean isRoot", () => {
    expect(
      parseSharePayload(payload({ nodes: [{ ...node("node-1"), isRoot: "yes" }], edges: [] })).ok
    ).toBe(false);
  });

  it("rejects an edge kind outside EdgeKind", () => {
    expect(
      parseSharePayload(payload({ edges: [edge("edge-1", "node-1", "node-2", "forged")] })).ok
    ).toBe(false);
  });

  it("rejects edges with unknown endpoints, self-loops or bad ids", () => {
    expect(parseSharePayload(payload({ edges: [edge("edge-1", "node-1", "missing")] })).ok).toBe(
      false
    );
    expect(parseSharePayload(payload({ edges: [edge("edge-1", "node-1", "node-1")] })).ok).toBe(
      false
    );
    expect(parseSharePayload(payload({ edges: [edge("bad id", "node-1", "node-2")] })).ok).toBe(
      false
    );
    expect(parseSharePayload(payload({ edges: ["edge"] })).ok).toBe(false);
  });
});
