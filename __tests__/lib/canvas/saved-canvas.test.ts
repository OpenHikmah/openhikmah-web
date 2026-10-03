import { describe, it, expect } from "vitest";

import { parseSavedCanvas } from "@/lib/canvas/saved-canvas";
import type { SavedCanvas } from "@/store/canvas";
import type { Verse } from "@/types/quran";

const verse = (ref: Verse["ref"] = "2:255"): Verse => ({
  surah: 2,
  ayah: 255,
  ref,
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
});

const node = (id: string, x = 10, y = 20, ref: Verse["ref"] = "2:255") => ({
  id,
  x,
  y,
  verse: verse(ref),
});

const edge = (
  id: string,
  source: string,
  target: string,
  kind = "thematic",
  extra: Record<string, unknown> = {}
) => ({ id, source, target, kind, label: "label", reason: "reason", ...extra });

const payload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1,
  nodes: [node("node-1"), node("node-2", 300, 20, "112:1")],
  edges: [edge("edge-1", "node-1", "node-2")],
  ...overrides,
});

describe("parseSavedCanvas", () => {
  it("accepts a well-formed payload and rebuilds it from known fields", () => {
    const result = parseSavedCanvas(payload({ extra: "ignored" }));
    expect(result).toEqual({
      v: 1,
      nodes: [
        { id: "node-1", x: 10, y: 20, verse: verse("2:255") },
        { id: "node-2", x: 300, y: 20, verse: verse("112:1") },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-1",
          target: "node-2",
          kind: "thematic",
          label: "label",
          reason: "reason",
        },
      ],
    } satisfies SavedCanvas);
  });

  it("treats a payload without edges as nodes only", () => {
    const { edges: _dropped, ...withoutEdges } = payload();
    const result = parseSavedCanvas(withoutEdges);
    expect(result?.nodes).toHaveLength(2);
    expect(result?.edges).toEqual([]);
  });

  it.each([
    ["a non-object", "nope"],
    ["null", null],
    ["the wrong version", payload({ v: 2 })],
  ])("rejects %s", (_label, input) => {
    expect(parseSavedCanvas(input)).toBeNull();
  });

  it("rejects empty or non-array nodes", () => {
    expect(parseSavedCanvas(payload({ nodes: [] }))).toBeNull();
    expect(parseSavedCanvas(payload({ nodes: {} }))).toBeNull();
    expect(parseSavedCanvas(payload({ nodes: undefined }))).toBeNull();
  });

  it("rejects non-array edges", () => {
    expect(parseSavedCanvas(payload({ edges: {} }))).toBeNull();
    expect(parseSavedCanvas(payload({ edges: "edges" }))).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity, undefined, "10", null])(
    "rejects a non-finite position %p",
    (bad) => {
      expect(parseSavedCanvas(payload({ nodes: [{ ...node("node-1"), x: bad }] }))).toBeNull();
      expect(parseSavedCanvas(payload({ nodes: [{ ...node("node-1"), y: bad }] }))).toBeNull();
    }
  );

  it("rejects nodes with bad ids, duplicate ids, or verses without a ref", () => {
    expect(parseSavedCanvas(payload({ nodes: [{ ...node("node-1"), id: "" }] }))).toBeNull();
    expect(parseSavedCanvas(payload({ nodes: [node("node-1"), node("node-1")] }))).toBeNull();
    expect(
      parseSavedCanvas(payload({ nodes: [{ ...node("node-1"), verse: { ref: 2255 } }] }))
    ).toBeNull();
    expect(parseSavedCanvas(payload({ nodes: [{ id: "node-1", x: 0, y: 0 }] }))).toBeNull();
  });

  it("drops duplicate edges between the same pair in either direction", () => {
    const result = parseSavedCanvas(
      payload({
        edges: [
          edge("edge-1", "node-1", "node-2"),
          edge("edge-2", "node-1", "node-2"),
          edge("edge-3", "node-2", "node-1"),
        ],
      })
    );
    expect(result?.edges).toHaveLength(1);
    expect(result?.edges[0].id).toBe("edge-1");
  });

  it("drops dangling edges whose endpoints are not among the nodes", () => {
    const result = parseSavedCanvas(
      payload({
        edges: [
          edge("edge-1", "node-1", "node-2"),
          edge("edge-2", "node-1", "missing"),
          edge("edge-3", "missing", "node-2"),
        ],
      })
    );
    expect(result?.edges).toHaveLength(1);
    expect(result?.edges[0].id).toBe("edge-1");
  });

  it("drops self-loops, unknown kinds, and malformed edge entries", () => {
    const result = parseSavedCanvas(
      payload({
        edges: [
          edge("edge-1", "node-1", "node-2"),
          edge("edge-loop", "node-1", "node-1"),
          edge("edge-forged", "node-1", "node-2", "forged"),
          "edge",
          { id: "", source: "node-1", target: "node-2", kind: "thematic" },
        ],
      })
    );
    expect(result?.edges).toHaveLength(1);
    expect(result?.edges[0].id).toBe("edge-1");
  });

  it("defaults missing edge label and reason to empty strings", () => {
    const result = parseSavedCanvas(
      payload({ edges: [{ id: "edge-1", source: "node-1", target: "node-2", kind: "root" }] })
    );
    expect(result?.edges).toEqual([
      {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
        kind: "root",
        label: "",
        reason: "",
      },
    ]);
  });
});
