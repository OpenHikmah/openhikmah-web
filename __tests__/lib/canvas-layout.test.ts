import { describe, it, expect } from "vitest";
import {
  findFreeSlot,
  viewportCenter,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_GAP,
  type XY,
} from "@/lib/canvas-layout";

/** A node overlaps the slot if both axes are within box+gap of each other. */
function overlapsAny(slot: XY, nodes: XY[]): boolean {
  return nodes.some(
    (n) =>
      Math.abs(slot.x - n.x) < NODE_WIDTH + NODE_GAP &&
      Math.abs(slot.y - n.y) < NODE_HEIGHT + NODE_GAP
  );
}

describe("findFreeSlot", () => {
  it("returns the anchor unchanged on an empty canvas", () => {
    const anchor = { x: 120, y: -40 };
    expect(findFreeSlot([], anchor)).toEqual(anchor);
  });

  it("returns the anchor when it is already clear of all nodes", () => {
    const nodes = [{ x: 1000, y: 1000 }];
    const anchor = { x: 0, y: 0 };
    expect(findFreeSlot(nodes, anchor)).toEqual(anchor);
  });

  it("moves off a colliding anchor to a non-overlapping slot", () => {
    const nodes = [{ x: 0, y: 0 }];
    const slot = findFreeSlot(nodes, { x: 0, y: 0 });
    expect(slot).not.toEqual({ x: 0, y: 0 });
    expect(overlapsAny(slot, nodes)).toBe(false);
  });

  it("never overlaps any existing node, even on a dense cluster", () => {
    // A 3x3 block of nodes all stacked at the same anchor region.
    const nodes: XY[] = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        nodes.push({ x: i * (NODE_WIDTH + NODE_GAP), y: j * (NODE_HEIGHT + NODE_GAP) });
      }
    }
    const slot = findFreeSlot(nodes, { x: 0, y: 0 });
    expect(overlapsAny(slot, nodes)).toBe(false);
  });

  it("places the new node adjacent (within one ring) when the anchor is taken", () => {
    const nodes = [{ x: 0, y: 0 }];
    const slot = findFreeSlot(nodes, { x: 0, y: 0 });
    // Nearest free grid slot should be exactly one node+gap step away on an axis.
    const dx = Math.abs(slot.x);
    const dy = Math.abs(slot.y);
    expect(Math.max(dx, dy)).toBeLessThanOrEqual(NODE_WIDTH + NODE_GAP + 1);
  });

  it("keeps successive placements collision-free as the graph grows", () => {
    const placed: XY[] = [];
    for (let i = 0; i < 12; i++) {
      const slot = findFreeSlot(placed, { x: 0, y: 0 });
      expect(overlapsAny(slot, placed)).toBe(false);
      placed.push(slot);
    }
    expect(placed).toHaveLength(12);
  });
});

describe("viewportCenter", () => {
  it("returns screen-center in flow units at identity transform", () => {
    expect(viewportCenter({ x: 0, y: 0, zoom: 1 }, 1000, 600)).toEqual({ x: 500, y: 300 });
  });

  it("accounts for pan and zoom", () => {
    // Panned right 200, down 100, zoomed 2x.
    expect(viewportCenter({ x: 200, y: 100, zoom: 2 }, 1000, 600)).toEqual({ x: 150, y: 100 });
  });

  it("treats zoom 0 as 1 to avoid division by zero", () => {
    const c = viewportCenter({ x: 0, y: 0, zoom: 0 }, 800, 400);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(c).toEqual({ x: 400, y: 200 });
  });
});
