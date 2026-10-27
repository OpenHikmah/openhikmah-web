import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import type { EdgeProps } from "@xyflow/react";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";
import { useCanvasStore } from "@/store/canvas";

const internalNodes = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@xyflow/react", () => ({
  useInternalNode: (id: string) => internalNodes.get(id),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-layer">{children}</div>
  ),
}));

import { HikmahEdge, floatingPath } from "@/components/canvas/HikmahEdge";

type Box = { x: number; y: number; w: number; h: number };

const A: Box = { x: 0, y: 0, w: 288, h: 200 };

function numbers(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function expectedOffset(p0: { x: number; y: number }, p3: { x: number; y: number }): number {
  return Math.max(50, Math.hypot(p3.x - p0.x, p3.y - p0.y) * 0.35);
}

describe("floatingPath", () => {
  it("leaves from A's right side and arrives at B's left side when B is clearly to the right", () => {
    const b: Box = { x: 500, y: 100, w: 288, h: 200 };
    const { path, mid } = floatingPath(A, b);
    const [x0, y0, x1, y1, x2, y2, x3, y3] = numbers(path);
    const off = expectedOffset({ x: 288, y: 100 }, { x: 500, y: 200 });

    expect([x0, y0]).toEqual([288, 100]);
    expect([x3, y3]).toEqual([500, 200]);
    expect(x1).toBeCloseTo(288 + off);
    expect(y1).toBe(100);
    expect(x2).toBeCloseTo(500 - off);
    expect(y2).toBe(200);
    expect(mid.x).toBeCloseTo(394);
    expect(mid.y).toBeCloseTo(150);
  });

  it("leaves from A's left side and arrives at B's right side when B is clearly to the left", () => {
    const a: Box = { x: 600, y: 0, w: 288, h: 200 };
    const b: Box = { x: 0, y: 50, w: 288, h: 200 };
    const { path, mid } = floatingPath(a, b);
    const [x0, y0, x1, y1, x2, y2, x3, y3] = numbers(path);
    const off = expectedOffset({ x: 600, y: 100 }, { x: 288, y: 150 });

    expect([x0, y0]).toEqual([600, 100]);
    expect([x3, y3]).toEqual([288, 150]);
    expect(x1).toBeCloseTo(600 - off);
    expect(y1).toBe(100);
    expect(x2).toBeCloseTo(288 + off);
    expect(y2).toBe(150);
    expect(mid.x).toBeCloseTo(444);
    expect(mid.y).toBeCloseTo(125);
  });

  it("goes from A's bottom to B's top when B is below and overlaps A's columns", () => {
    const b: Box = { x: 50, y: 400, w: 288, h: 200 };
    const { path, mid } = floatingPath(A, b);
    const [x0, y0, x1, y1, x2, y2, x3, y3] = numbers(path);
    const off = expectedOffset({ x: 144, y: 200 }, { x: 194, y: 400 });

    expect([x0, y0]).toEqual([144, 200]);
    expect([x3, y3]).toEqual([194, 400]);
    expect(x1).toBe(144);
    expect(y1).toBeCloseTo(200 + off);
    expect(x2).toBe(194);
    expect(y2).toBeCloseTo(400 - off);
    expect(mid.x).toBeCloseTo(169);
    expect(mid.y).toBeCloseTo(300);
  });

  it("goes from A's top to B's bottom when B is above", () => {
    const a: Box = { x: 0, y: 500, w: 288, h: 200 };
    const b: Box = { x: 50, y: 0, w: 288, h: 200 };
    const { path } = floatingPath(a, b);
    const [x0, y0, x1, y1, x2, y2, x3, y3] = numbers(path);
    const off = expectedOffset({ x: 144, y: 500 }, { x: 194, y: 200 });

    expect([x0, y0]).toEqual([144, 500]);
    expect([x3, y3]).toEqual([194, 200]);
    expect(x1).toBe(144);
    expect(y1).toBeCloseTo(500 - off);
    expect(x2).toBe(194);
    expect(y2).toBeCloseTo(200 + off);
  });

  it("curves at least 50 units out of each side, however close the cards are", () => {
    const b: Box = { x: 0, y: 210, w: 288, h: 200 };
    const [, y0, , y1, , y2, , y3] = numbers(floatingPath(A, b).path);
    expect(y0).toBe(200);
    expect(y3).toBe(210);
    expect(y1).toBe(250);
    expect(y2).toBe(160);
  });

  it("uses the side-to-side route only when the gap is wider than 40", () => {
    const justInside: Box = { x: 288 + 40, y: 300, w: 288, h: 200 };
    const justOutside: Box = { x: 288 + 41, y: 300, w: 288, h: 200 };
    expect(numbers(floatingPath(A, justInside).path).slice(0, 2)).toEqual([144, 200]);
    expect(numbers(floatingPath(A, justOutside).path).slice(0, 2)).toEqual([288, 100]);

    const a: Box = { x: 600, y: 0, w: 288, h: 200 };
    const leftInside: Box = { x: 600 - 40 - 288, y: 300, w: 288, h: 200 };
    const leftOutside: Box = { x: 600 - 41 - 288, y: 300, w: 288, h: 200 };
    expect(numbers(floatingPath(a, leftInside).path).slice(0, 2)).toEqual([744, 200]);
    expect(numbers(floatingPath(a, leftOutside).path).slice(0, 2)).toEqual([600, 100]);
  });
});

function internalNode(box: Box, measured = true) {
  return {
    measured: measured ? { width: box.w, height: box.h } : {},
    internals: { positionAbsolute: { x: box.x, y: box.y } },
  };
}

function edgeProps(over: { id?: string; kind?: string; placeholder?: boolean }): EdgeProps {
  return {
    id: over.id ?? "e1",
    source: "a",
    target: "b",
    data: { kind: over.kind ?? "thematic", placeholder: over.placeholder },
  } as unknown as EdgeProps;
}

function renderEdge(props: EdgeProps) {
  return renderWithIntl(
    <svg>
      <HikmahEdge {...props} />
    </svg>
  );
}

const visiblePath = (c: HTMLElement) => c.querySelector<SVGPathElement>(".react-flow__edge-path");
const hitPath = (c: HTMLElement) =>
  c.querySelector<SVGPathElement>(".react-flow__edge-interaction");

describe("HikmahEdge", () => {
  beforeEach(() => {
    internalNodes.clear();
    internalNodes.set("a", internalNode(A));
    internalNodes.set("b", internalNode({ x: 500, y: 100, w: 288, h: 200 }));
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      sidebarContent: null,
      expansionFocus: null,
      hoveredEdgeId: null,
    });
  });

  it("draws nothing until both cards are measured", () => {
    internalNodes.set("b", internalNode({ x: 500, y: 100, w: 288, h: 200 }, false));
    const { container } = renderEdge(edgeProps({}));
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("draws nothing when a card is missing", () => {
    internalNodes.delete("a");
    const { container } = renderEdge(edgeProps({}));
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it.each([
    ["thematic", "var(--color-theme-edge)"],
    ["root", "var(--color-root-edge)"],
    ["contrast", "var(--color-contrast-edge)"],
  ])("colours a %s line with its own kind colour", (kind, colour) => {
    const { container } = renderEdge(edgeProps({ kind }));
    expect(visiblePath(container)?.getAttribute("stroke")).toBe(colour);
  });

  it("is a quiet dashed line with a wide invisible hit area by default", () => {
    const { container } = renderEdge(edgeProps({}));
    const line = visiblePath(container)!;
    expect(line.getAttribute("stroke-dasharray")).toBe("5 5");
    expect(line.style.opacity).toBe("0.6");
    expect(line.classList.contains("hikmah-edge-flow")).toBe(false);
    expect(hitPath(container)?.getAttribute("stroke-width")).toBe("18");
    expect(screen.queryByTestId("edge-label-layer")).toBeNull();
  });

  it("shows its kind on hover and hides it again on leave", () => {
    const { container } = renderEdge(edgeProps({ kind: "root" }));
    fireEvent.mouseEnter(hitPath(container)!);
    expect(screen.getByTestId("edge-label-layer")).toHaveTextContent("ع Root");
    expect(visiblePath(container)!.style.opacity).toBe("1");
    expect(visiblePath(container)!.classList.contains("hikmah-edge-flow")).toBe(true);

    fireEvent.mouseLeave(hitPath(container)!);
    expect(screen.queryByTestId("edge-label-layer")).toBeNull();
    expect(visiblePath(container)!.style.opacity).toBe("0.6");
  });

  it.each([
    ["thematic", "◈ Theme"],
    ["contrast", "↔ Contrast"],
  ])("labels a %s line with its glyph and word", (kind, text) => {
    const { container } = renderEdge(edgeProps({ kind }));
    fireEvent.mouseEnter(hitPath(container)!);
    expect(screen.getByTestId("edge-label-layer")).toHaveTextContent(text);
  });

  it("lights up when the reading panel hovers this line, and only this one", () => {
    const { container } = renderEdge(edgeProps({ id: "e1" }));
    act(() => useCanvasStore.setState({ hoveredEdgeId: "other" }));
    expect(screen.queryByTestId("edge-label-layer")).toBeNull();

    act(() => useCanvasStore.setState({ hoveredEdgeId: "e1" }));
    expect(screen.getByTestId("edge-label-layer")).toBeInTheDocument();
    expect(visiblePath(container)!.style.opacity).toBe("1");
  });

  it("fades when the reading panel shows a verse this line is not attached to", () => {
    useCanvasStore.setState({
      edges: [
        { id: "e1", source: "a", target: "b", type: "hikmah", data: { kind: "thematic" } },
        { id: "e2", source: "c", target: "d", type: "hikmah", data: { kind: "thematic" } },
      ],
      sidebarContent: { type: "node", nodeId: "c" },
    });
    const { container } = renderEdge(edgeProps({ id: "e1" }));
    expect(visiblePath(container)!.style.opacity).toBe("0.12");
  });

  it("stays fully visible and flowing when the reading panel shows one of its verses", () => {
    useCanvasStore.setState({
      edges: [{ id: "e1", source: "a", target: "b", type: "hikmah", data: { kind: "thematic" } }],
      sidebarContent: { type: "node", nodeId: "a" },
    });
    const { container } = renderEdge(edgeProps({ id: "e1" }));
    expect(visiblePath(container)!.style.opacity).toBe("1");
    expect(visiblePath(container)!.classList.contains("hikmah-edge-flow")).toBe(true);
  });

  it("draws a placeholder line soft and flowing, with no hit area and no label", () => {
    useCanvasStore.setState({ hoveredEdgeId: "e1" });
    const { container } = renderEdge(edgeProps({ id: "e1", placeholder: true }));
    const line = visiblePath(container)!;
    expect(line.style.opacity).toBe("0.55");
    expect(line.classList.contains("hikmah-edge-flow")).toBe(true);
    expect(hitPath(container)).toBeNull();
    expect(screen.queryByTestId("edge-label-layer")).toBeNull();
  });
});
