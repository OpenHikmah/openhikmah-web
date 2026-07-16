import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCanvasStore } from "@/store/canvas";
import type { Verse, VerseRef } from "@/types/quran";

vi.mock("@xyflow/react", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useReactFlow: () => ({ fitView: vi.fn() }),
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

describe("CanvasToolbar export menu", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useCanvasStore.setState({ nodes: [verseNode() as any], edges: [] });
  });

  it("opens the export menu on click", () => {
    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByRole("button", { name: /PNG/ })).toBeInTheDocument();
  });

  it("closes the export menu on an outside click", () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <CanvasToolbar onSearchOpen={vi.fn()} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByRole("button", { name: /PNG/ })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("button", { name: /PNG/ })).not.toBeInTheDocument();
  });

  it("stays open on a click inside the menu itself", () => {
    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.mouseDown(screen.getByRole("button", { name: /PNG/ }));
    expect(screen.getByRole("button", { name: /PNG/ })).toBeInTheDocument();
  });

  it("re-clicking the export toggle button still closes the menu", () => {
    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: /export/i });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /PNG/ })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: /PNG/ })).not.toBeInTheDocument();
  });
});
