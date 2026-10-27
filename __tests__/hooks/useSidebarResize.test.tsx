import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import { useCanvasStore, DEFAULT_SIDEBAR_WIDTH } from "@/store/canvas";

const MIN_WIDTH = 340;
const MAX_CAP = 720;
const originalInnerWidth = window.innerWidth;

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

function press(result: { current: ReturnType<typeof useSidebarResize> }, clientX: number) {
  act(() => result.current.onHandlePointerDown({ clientX } as ReactPointerEvent));
}

function move(clientX: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent("pointermove", { clientX }));
  });
}

function release() {
  act(() => {
    window.dispatchEvent(new MouseEvent("pointerup"));
  });
}

describe("useSidebarResize", () => {
  beforeEach(() => {
    setViewport(2000);
    useCanvasStore.setState({ sidebarWidth: 400 });
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  afterEach(() => {
    setViewport(originalInnerWidth);
  });

  it("starts at the store width and is not resizing", () => {
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.width).toBe(400);
    expect(result.current.isResizing).toBe(false);
  });

  it("opens wide enough to read in: the default is not below the minimum", () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBeGreaterThanOrEqual(MIN_WIDTH);
  });

  it("widens when the handle is dragged left and narrows when dragged right", () => {
    const { result } = renderHook(() => useSidebarResize());
    press(result, 1000);
    expect(result.current.isResizing).toBe(true);

    move(900);
    expect(result.current.width).toBe(500);
    move(1050);
    expect(result.current.width).toBe(350);
  });

  it("never gets narrower than the minimum", () => {
    const { result } = renderHook(() => useSidebarResize());
    press(result, 1000);
    move(1400);
    expect(result.current.width).toBe(MIN_WIDTH);
  });

  it("never gets wider than the cap on a wide screen", () => {
    const { result } = renderHook(() => useSidebarResize());
    press(result, 1000);
    move(-5000);
    expect(result.current.width).toBe(MAX_CAP);
  });

  it("never takes more than 60% of a narrower screen", () => {
    setViewport(1000);
    const { result } = renderHook(() => useSidebarResize());
    press(result, 1000);
    move(-5000);
    expect(result.current.width).toBe(600);
  });

  it("measures from where the drag started, not from the previous move", () => {
    const { result } = renderHook(() => useSidebarResize());
    press(result, 1000);
    move(950);
    move(950);
    expect(result.current.width).toBe(450);
  });

  it("stops following the pointer after release", () => {
    const { result } = renderHook(() => useSidebarResize());
    press(result, 1000);
    move(900);
    release();
    expect(result.current.isResizing).toBe(false);
    move(700);
    expect(result.current.width).toBe(500);
  });

  it("locks text selection and shows the resize cursor only while dragging", () => {
    document.body.style.cursor = "pointer";
    document.body.style.userSelect = "text";
    const { result } = renderHook(() => useSidebarResize());

    press(result, 1000);
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");

    release();
    expect(document.body.style.cursor).toBe("pointer");
    expect(document.body.style.userSelect).toBe("text");
  });

  it("restores the page and stops listening when unmounted mid-drag", () => {
    const { result, unmount } = renderHook(() => useSidebarResize());
    press(result, 1000);
    unmount();

    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    move(700);
    expect(useCanvasStore.getState().sidebarWidth).toBe(400);
  });
});
