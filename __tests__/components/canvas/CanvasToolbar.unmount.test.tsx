import { screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl as render } from "../../test-utils/render-with-intl";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import type { Verse, VerseRef } from "@/types/quran";

vi.mock("@xyflow/react", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useReactFlow: () => ({ fitView: vi.fn() }),
}));

vi.mock("@/lib/canvas/canvas-export", () => ({
  exportCanvasToPng: vi.fn().mockRejectedValue(new Error("export failed")),
  exportCanvasToPdf: vi.fn().mockRejectedValue(new Error("export failed")),
  downloadDataUrl: vi.fn(),
  downloadBlob: vi.fn(),
}));

import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";

function verseNode() {
  const verse: Verse = {
    surah: 1,
    ayah: 1,
    ref: "1:1" as VerseRef,
    arabicText: "نص",
    translation: "text",
    surahName: "Al-Fatihah",
    surahNameArabic: "الفاتحة",
  };
  return { id: "n1", type: "verse", position: { x: 0, y: 0 }, data: verse };
}

describe("CanvasToolbar unmount while a request is in flight", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useCanvasStore.setState({ nodes: [verseNode() as any], edges: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAuthStore.setState({ accessToken: "test-token" as any });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears the pending save-error reset timeout on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    // Let the failed save settle and schedule its error-reset timeout.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("clears the pending share-error reset timeout on unmount", async () => {
    const originalClipboard = navigator.clipboard;
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("clipboard denied")) },
    });
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    Object.assign(navigator, { clipboard: originalClipboard });
  });

  it("clears the pending export-error reset timeout on unmount", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(screen.getByRole("button", { name: /PNG/ }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("does not throw when a save request resolves after the component has unmounted", async () => {
    let resolveFetch: (value: { ok: boolean }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      )
    );

    const { unmount } = render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    unmount();

    expect(() => {
      resolveFetch!({ ok: false });
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
