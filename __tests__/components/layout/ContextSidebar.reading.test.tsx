import { screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { ContextSidebar } from "@/components/layout/ContextSidebar";
import { TooltipProvider } from "@/components/ui";
import { useCanvasStore } from "@/store/canvas";
import type { Verse, VerseRef } from "@/types/quran";

// en.sahih (Saheeh International, alquran.cloud) translations.
function verse(ref: VerseRef, arabicText: string, translation: string, isRoot = false): Verse {
  const [surah, ayah] = ref.split(":").map(Number);
  return {
    surah,
    ayah,
    ref,
    arabicText,
    translation,
    surahName: surah === 2 ? "Al-Baqarah" : "Al-Anfal",
    surahNameArabic: surah === 2 ? "البقرة" : "الأنفال",
    isRoot,
  };
}

const V153 = verse(
  "2:153",
  "يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ ٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ ۚ إِنَّ ٱللَّهَ مَعَ ٱلصَّٰبِرِينَ",
  "O you who have believed, seek help through patience and prayer. Indeed, Allah is with the patient.",
  true
);
const V45 = verse(
  "2:45",
  "وَٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ ۚ وَإِنَّهَا لَكَبِيرَةٌ إِلَّا عَلَى ٱلْخَٰشِعِينَ",
  "And seek help through patience and prayer, and indeed, it is difficult except for the humbly submissive [to Allah]"
);
const V846 = verse(
  "8:46",
  "وَأَطِيعُوا۟ ٱللَّهَ وَرَسُولَهُۥ وَلَا تَنَٰزَعُوا۟ فَتَفْشَلُوا۟ وَتَذْهَبَ رِيحُكُمْ ۖ وَٱصْبِرُوٓا۟ ۚ إِنَّ ٱللَّهَ مَعَ ٱلصَّٰبِرِينَ",
  "And obey Allah and His Messenger, and do not dispute and [thus] lose courage and [then] your strength would depart; and be patient. Indeed, Allah is with the patient."
);

const REASON_45 =
  "This verse directly reinforces the source verse by reiterating the command to seek divine assistance through patience and ritual prayer.";
const REASON_846 =
  "It affirms the exact theological promise found in the source verse that the Divine accompaniment (Ma'iyyah) is with those who practice patience.";

function node(id: string, data: Verse) {
  return { id, type: "verse", position: { x: 0, y: 0 }, data };
}
function edge(id: string, source: string, target: string, reason: string) {
  return {
    id,
    source,
    target,
    type: "hikmah",
    data: { kind: "thematic", label: reason.slice(0, 60), reason },
  };
}

function renderPanel() {
  return renderWithIntl(
    <TooltipProvider>
      <ContextSidebar />
    </TooltipProvider>
  );
}

describe("ContextSidebar — reading views", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
    useCanvasStore.setState({
      nodes: [node("a", V153), node("b", V45), node("c", V846)] as never,
      edges: [edge("e1", "a", "b", REASON_45), edge("e2", "a", "c", REASON_846)] as never,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useCanvasStore.getState().setSidebarContent(null);
  });

  it("lists every connected verse in full with its AI-marked reason", () => {
    act(() => useCanvasStore.getState().setSidebarContent({ type: "node", nodeId: "a" }));
    renderPanel();

    expect(screen.getByText("Starting verse")).toBeInTheDocument();
    expect(screen.getByText("2 connected verses")).toBeInTheDocument();
    expect(screen.getByText(REASON_45)).toBeInTheDocument();
    expect(screen.getByText(REASON_846)).toBeInTheDocument();
    // Full translation, not cut at 100 characters as the old panel did.
    expect(screen.getByText(V846.translation)).toBeInTheDocument();
    // AI text is labelled, never styled as scripture.
    expect(screen.getAllByRole("img", { name: "AI-written explanation" })).toHaveLength(2);
  });

  it("puts the verse before the AI reason in each connection card", () => {
    act(() => useCanvasStore.getState().setSidebarContent({ type: "node", nodeId: "a" }));
    renderPanel();

    const card = screen.getByRole("button", { name: "Connection 2:153 to 8:46" });
    const translation = within(card).getByText(V846.translation);
    const arabic = within(card).getByText(V846.arabicText);
    const reason = within(card).getByText(REASON_846);
    expect(translation.compareDocumentPosition(reason)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(arabic.compareDocumentPosition(reason)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows each reason as a one-line preview that opens in place", () => {
    // jsdom has no layout, so stub a reason that runs past its one-line clamp.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
    act(() => useCanvasStore.getState().setSidebarContent({ type: "node", nodeId: "a" }));
    renderPanel();

    expect(screen.getByText(REASON_45)).toHaveClass("line-clamp-1");
    const card = screen.getByRole("button", { name: "Connection 2:153 to 2:45" });
    fireEvent.click(within(card).getByRole("button", { name: "More" }));

    expect(screen.getByText(REASON_45)).not.toHaveClass("line-clamp-1");
    expect(within(card).getByRole("button", { name: "Less" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    // Opening the reason must not open the pair view.
    expect(useCanvasStore.getState().sidebarContent).toEqual({ type: "node", nodeId: "a" });
    vi.restoreAllMocks();
  });

  it("shows no toggle when the reason fits on one line", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(20);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
    act(() => useCanvasStore.getState().setSidebarContent({ type: "node", nodeId: "a" }));
    renderPanel();

    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("opens the connection view with both verses and the reason between them", () => {
    act(() => useCanvasStore.getState().setSidebarContent({ type: "node", nodeId: "a" }));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Connection 2:153 to 2:45" }));

    expect(screen.getByText("◈ Thematic connection")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(V153.translation)).toBeInTheDocument();
    expect(screen.getByText(V45.translation)).toBeInTheDocument();
    expect(screen.getByText(REASON_45)).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("steps to the next connection with the arrow key and the pager", () => {
    act(() =>
      useCanvasStore
        .getState()
        .setSidebarContent({ type: "edge", edgeId: "e1", contextNodeId: "a" })
    );
    renderPanel();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.getByText(REASON_846)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous connection" }));
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("goes back to the verse thread from a connection", () => {
    act(() =>
      useCanvasStore
        .getState()
        .setSidebarContent({ type: "edge", edgeId: "e2", contextNodeId: "a" })
    );
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "All connections of 2:153" }));
    expect(useCanvasStore.getState().sidebarContent).toEqual({ type: "node", nodeId: "a" });
  });

  it("closes when the card it shows leaves the canvas", () => {
    act(() => useCanvasStore.getState().setSidebarContent({ type: "node", nodeId: "b" }));
    renderPanel();
    expect(
      within(screen.getByRole("complementary")).getByText(V45.translation)
    ).toBeInTheDocument();

    act(() => {
      const { nodes, setNodes } = useCanvasStore.getState();
      setNodes(nodes.filter((n) => n.id !== "b"));
    });
    expect(useCanvasStore.getState().sidebarContent).toBeNull();
  });
});
