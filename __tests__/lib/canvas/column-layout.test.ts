import { describe, it, expect } from "vitest";
import {
  placeColumnGroup,
  relayoutCanvas,
  NODE_WIDTH,
  COLUMN_GAP,
  ROW_GAP,
  type LayoutBox,
  type LayoutNode,
} from "@/lib/canvas/canvas-layout";

const COL = NODE_WIDTH + COLUMN_GAP;

function overlaps(a: LayoutBox, b: LayoutBox): boolean {
  return a.x < b.x + NODE_WIDTH && b.x < a.x + NODE_WIDTH && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("placeColumnGroup", () => {
  it("stacks a group in the next column, centred on the source", () => {
    const source = { x: 0, y: 0, h: 200 };
    const out = placeColumnGroup(source, [200, 200, 200], []);
    expect(out.map((p) => p.x)).toEqual([COL, COL, COL]);
    expect(out[1].y).toBe(out[0].y + 200 + ROW_GAP);
    const blockMid = (out[0].y + out[2].y + 200) / 2;
    expect(blockMid).toBe(100);
  });

  it("slides the group to the nearest free space without moving obstacles", () => {
    const source = { x: 0, y: 0, h: 200 };
    const obstacle = { x: COL, y: -50, h: 300 };
    const out = placeColumnGroup(source, [200], [obstacle]);
    expect(out[0].x).toBe(COL);
    expect(overlaps({ ...out[0], h: 200 }, obstacle)).toBe(false);
    expect(Math.abs(out[0].y)).toBeLessThan(400);
  });

  it("moves one column further right when the near column is crowded", () => {
    const source = { x: 0, y: 0, h: 200 };
    const wall = { x: COL, y: -1500, h: 3200 };
    const out = placeColumnGroup(source, [200, 200], [wall]);
    expect(out[0].x).toBe(2 * COL);
    expect(out[0].y).toBe(-110);
  });

  it("returns nothing for an empty group", () => {
    expect(placeColumnGroup({ x: 0, y: 0, h: 200 }, [], [])).toEqual([]);
  });
});

describe("relayoutCanvas", () => {
  const base = (id: string, extra: Partial<LayoutNode> = {}): LayoutNode => ({
    id,
    x: 0,
    y: 0,
    h: 200,
    ...extra,
  });

  it("keeps cards no expansion added where they are", () => {
    const nodes = [base("a", { x: 50, y: 70 }), base("search", { x: 900, y: 900 })];
    const out = relayoutCanvas(nodes);
    expect(out.get("a")).toEqual({ x: 50, y: 70 });
    expect(out.get("search")).toEqual({ x: 900, y: 900 });
  });

  it("re-places expansion cards into a column beside their source", () => {
    const nodes = [
      base("a"),
      base("b", { placedFrom: "a", x: 999, y: 999 }),
      base("c", { placedFrom: "a", x: -999, y: 3 }),
    ];
    const out = relayoutCanvas(nodes);
    expect(out.get("b")?.x).toBe(COL);
    expect(out.get("c")?.x).toBe(COL);
    expect(out.get("c")!.y - out.get("b")!.y).toBe(200 + ROW_GAP);
  });

  it("brings cards closer together when cards get shorter", () => {
    const tall = [base("a"), base("b", { placedFrom: "a" }), base("c", { placedFrom: "a" })];
    const short = tall.map((n) => ({ ...n, h: 120 }));
    const gap = (m: Map<string, { x: number; y: number }>) => m.get("c")!.y - m.get("b")!.y;
    expect(gap(relayoutCanvas(short))).toBeLessThan(gap(relayoutCanvas(tall)));
  });

  it("keeps a card moved by hand and places others around it", () => {
    const nodes = [
      base("a"),
      base("b", { placedFrom: "a", pinned: true, x: COL, y: -10 }),
      base("c", { placedFrom: "a" }),
    ];
    const out = relayoutCanvas(nodes);
    expect(out.get("b")).toEqual({ x: COL, y: -10 });
    expect(overlaps({ ...out.get("c")!, h: 200 }, { x: COL, y: -10, h: 200 })).toBe(false);
  });

  it("places a later expansion without moving cards an earlier one placed", () => {
    const first = [base("a"), base("b", { placedFrom: "a" }), base("c", { placedFrom: "a" })];
    const before = relayoutCanvas(first);
    const after = relayoutCanvas([...first, base("d", { placedFrom: "b" })]);
    expect(after.get("b")).toEqual(before.get("b"));
    expect(after.get("c")).toEqual(before.get("c"));
    expect(after.get("d")?.x).toBe(2 * COL);
  });
});
