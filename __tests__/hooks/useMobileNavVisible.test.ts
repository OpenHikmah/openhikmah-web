import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMobileNavVisible } from "@/hooks/useMobileNavVisible";

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: mockUsePathname }));

const { mockNodeCount } = vi.hoisted(() => ({ mockNodeCount: vi.fn() }));
vi.mock("@/store/canvas", () => ({
  useCanvasStore: (selector: (s: { nodes: unknown[] }) => unknown) =>
    selector({ nodes: new Array(mockNodeCount()) }),
}));

describe("useMobileNavVisible", () => {
  it("is visible on non-canvas routes regardless of node count", () => {
    mockUsePathname.mockReturnValue("/search");
    mockNodeCount.mockReturnValue(0);
    expect(renderHook(() => useMobileNavVisible()).result.current).toBe(true);
  });

  it("is visible on an empty canvas", () => {
    mockUsePathname.mockReturnValue("/canvas");
    mockNodeCount.mockReturnValue(0);
    expect(renderHook(() => useMobileNavVisible()).result.current).toBe(true);
  });

  it("is hidden on a populated canvas", () => {
    mockUsePathname.mockReturnValue("/canvas");
    mockNodeCount.mockReturnValue(3);
    expect(renderHook(() => useMobileNavVisible()).result.current).toBe(false);
  });
});
