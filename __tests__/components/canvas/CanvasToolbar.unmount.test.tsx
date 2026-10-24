import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Node } from "@xyflow/react";
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

function chooseFromMore(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("button", { name }));
}

function verseNode(): Node {
  // en.sahih (Saheeh International, alquran.cloud) — Al-Fatihah 1:1.
  const verse: Verse = {
    surah: 1,
    ayah: 1,
    ref: "1:1" as VerseRef,
    arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
    surahName: "Al-Fatihah",
    surahNameArabic: "الفاتحة",
  };
  // Matches the cast used for the same Verse -> Node data shape in store/canvas.ts.
  return { id: "n1", type: "verse", position: { x: 0, y: 0 }, data: { ...verse } } as Node;
}

describe("CanvasToolbar unmount while a request is in flight", () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [verseNode()], edges: [] });
    useAuthStore.setState({ accessToken: "test-token" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears the previous save-error timeout when a second save fails, and clears it again on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    chooseFromMore("Save to my canvases");

    // Let the first failed save settle and schedule its error-reset timeout.
    expect(await screen.findByText("Save failed — try again")).toBeInTheDocument();

    // A second failed save must clear the first timeout before scheduling its own.
    clearTimeoutSpy.mockClear();
    chooseFromMore("Save to my canvases");
    expect(await screen.findByText("Save failed — try again")).toBeInTheDocument();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockClear();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("clears the previous share-error timeout when a second share fails, and clears it again on unmount", async () => {
    const originalClipboard = navigator.clipboard;
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("clipboard denied")) },
    });
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    const shareButton = screen.getByRole("button", { name: /share/i });
    fireEvent.click(shareButton);

    await waitFor(() => expect(shareButton).not.toBeDisabled());

    fireEvent.click(shareButton);
    await waitFor(() => expect(shareButton).not.toBeDisabled());

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockClear();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    Object.assign(navigator, { clipboard: originalClipboard });
  });

  it("clears the previous download-error timeout when a second download fails, and clears it again on unmount", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    chooseFromMore("Download image");
    expect(await screen.findByText("Failed")).toBeInTheDocument();

    clearTimeoutSpy.mockClear();
    chooseFromMore("Download image");
    await waitFor(() => expect(clearTimeoutSpy).toHaveBeenCalled());

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockClear();

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
    chooseFromMore("Save to my canvases");

    unmount();

    expect(() => {
      resolveFetch!({ ok: false });
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("does not schedule a feedback timer when a share succeeds after unmount", async () => {
    let resolveClipboard: () => void;
    const originalClipboard = navigator.clipboard;
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockReturnValue(
          new Promise<void>((resolve) => {
            resolveClipboard = resolve;
          })
        ),
      },
    });
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    const { unmount } = render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    unmount();
    setTimeoutSpy.mockClear();

    expect(() => resolveClipboard!()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    Object.assign(navigator, { clipboard: originalClipboard });
  });
});
