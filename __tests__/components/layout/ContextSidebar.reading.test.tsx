import { screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { ContextSidebar } from "@/components/layout/ContextSidebar";
import { TooltipProvider } from "@/components/ui";
import { useCanvasStore } from "@/store/canvas";
import { usePreferencesStore } from "@/store/preferences";
import type { EdgeKind, Verse, VerseRef } from "@/types/quran";

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
const V155 = verse(
  "2:155",
  "وَلَنَبْلُوَنَّكُم بِشَىْءٍۢ مِّنَ ٱلْخَوْفِ وَٱلْجُوعِ وَنَقْصٍۢ مِّنَ ٱلْأَمْوَٰلِ وَٱلْأَنفُسِ وَٱلثَّمَرَٰتِ ۗ وَبَشِّرِ ٱلصَّٰبِرِينَ",
  "And We will surely test you with something of fear and hunger and a loss of wealth and lives and fruits, but give good tidings to the patient,"
);

const REASON_45 =
  "This verse directly reinforces the source verse by reiterating the command to seek divine assistance through patience and ritual prayer.";
const REASON_846 =
  "It affirms the exact theological promise found in the source verse that the Divine accompaniment (Ma'iyyah) is with those who practice patience.";
const REASON_155 =
  "This verse employs the same root for patience (s-b-r) to comfort the believers with the glad tidings of divine grace when they are tested with trials.";

function node(id: string, data: Verse) {
  return { id, type: "verse", position: { x: 0, y: 0 }, data };
}
function edge(id: string, source: string, target: string, reason: string, kind: EdgeKind) {
  return {
    id,
    source,
    target,
    type: "hikmah",
    data: { kind, label: reason.slice(0, 60), reason },
  };
}

const NODES = [node("a", V153), node("b", V45), node("c", V846), node("d", V155)];
const THEME_EDGES = [
  edge("e1", "a", "b", REASON_45, "thematic"),
  edge("e2", "a", "c", REASON_846, "thematic"),
];
const ROOT_EDGE = edge("e3", "a", "d", REASON_155, "root");

function renderPanel() {
  return renderWithIntl(
    <TooltipProvider>
      <ContextSidebar />
    </TooltipProvider>
  );
}
const openNode = (nodeId: string) =>
  act(() => useCanvasStore.getState().setSidebarContent({ type: "node", nodeId }));
const openEdge = (edgeId: string, contextNodeId: string) =>
  act(() => useCanvasStore.getState().setSidebarContent({ type: "edge", edgeId, contextNodeId }));
const row = (to: string) =>
  screen.getByRole("button", { name: `Read 2:153 and ${to} together` }).closest("li")!;
const precedes = (a: Element, b: Element) =>
  expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

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
    // jsdom has no layout, so no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    usePreferencesStore.getState().setCanvasPrefs({ showArabic: true });
    useCanvasStore.setState({ nodes: NODES as never, edges: THEME_EDGES as never });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useCanvasStore.getState().setSidebarContent(null);
  });

  it("carries the verse in the header and lists each connected verse in full", () => {
    openNode("a");
    renderPanel();

    const header = screen.getByRole("button", { name: "Close panel" }).parentElement!;
    expect(header).toHaveTextContent("2:153Al-Baqarah");
    expect(screen.getByRole("tab", { name: "Connections 2", selected: true })).toBeInTheDocument();
    expect(screen.getByText(V45.translation)).toBeInTheDocument();
    expect(screen.getByText(V846.translation)).toBeInTheDocument();
    expect(screen.queryByText("Starting verse")).not.toBeInTheDocument();
    expect(screen.queryByText("Read side by side")).not.toBeInTheDocument();
  });

  it("keeps every AI reason closed until the reader asks for it", () => {
    openNode("a");
    renderPanel();

    expect(screen.queryByText(REASON_45)).not.toBeInTheDocument();
    expect(screen.queryByText(REASON_846)).not.toBeInTheDocument();
    expect(screen.queryByText("AI reflection")).not.toBeInTheDocument();
  });

  it("opens a reason from the kind word, under the verse, marked as AI and not tafsir", () => {
    openNode("a");
    renderPanel();

    const r = row("8:46");
    const toggle = within(r).getByRole("button", { name: "Why connected: Theme" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const reason = within(r).getByText(REASON_846);
    expect(within(r).getByText("AI reflection")).toBeInTheDocument();
    expect(within(r).getByText("not tafsir")).toBeInTheDocument();
    precedes(within(r).getByText(V846.translation), reason);
    precedes(within(r).getByText(V846.arabicText), reason);
    // Only this row's reason opens, and opening it must not open the pair view.
    expect(screen.queryByText(REASON_45)).not.toBeInTheDocument();
    expect(useCanvasStore.getState().sidebarContent).toEqual({ type: "node", nodeId: "a" });

    fireEvent.click(toggle);
    expect(screen.queryByText(REASON_846)).not.toBeInTheDocument();
  });

  it("shows Arabic in the list only while 'Arabic on cards' is on", () => {
    openNode("a");
    renderPanel();
    expect(within(row("2:45")).getByText(V45.arabicText)).toBeInTheDocument();

    act(() => usePreferencesStore.getState().setCanvasPrefs({ showArabic: false }));
    expect(screen.queryByText(V45.arabicText)).not.toBeInTheDocument();
    expect(screen.getByText(V45.translation)).toBeInTheDocument();
  });

  it("shows kind filters only when the verse has more than one kind, never with a zero", () => {
    openNode("a");
    const { unmount } = renderPanel();
    expect(screen.queryByRole("group", { name: "Show connections by kind" })).toBeNull();
    unmount();

    act(() => useCanvasStore.setState({ edges: [...THEME_EDGES, ROOT_EDGE] as never }));
    renderPanel();
    const filters = within(screen.getByRole("group", { name: "Show connections by kind" }));
    expect(filters.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "All 3",
      "◈Theme 2",
      "عRoot 1",
    ]);

    fireEvent.click(filters.getByRole("button", { name: /Root 1/ }));
    expect(filters.getByRole("button", { name: /Root 1/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(V155.translation)).toBeInTheDocument();
    expect(screen.queryByText(V45.translation)).not.toBeInTheDocument();
  });

  it("says how to find connections when a verse has none", () => {
    openNode("b");
    act(() => useCanvasStore.setState({ edges: [] }));
    renderPanel();

    expect(
      screen.getByText(
        "No connected verses yet. Use “Find linked verses” on the card to find some."
      )
    ).toBeInTheDocument();
  });

  it("opens a pair with the verse you came from first and its reason closed", () => {
    openNode("a");
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Read 2:153 and 2:45 together" }));

    expect(useCanvasStore.getState().sidebarContent).toEqual({
      type: "edge",
      edgeId: "e1",
      contextNodeId: "a",
    });
    precedes(screen.getByText(V153.translation), screen.getByText(V45.translation));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.queryByText(REASON_45)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Why connected: Thematic connection" }));
    precedes(screen.getByText(V45.arabicText), screen.getByText(REASON_45));
    expect(screen.getByText("AI reflection")).toBeInTheDocument();
  });

  it("drops the canvas hover when a focused row opens its pair", () => {
    openNode("a");
    renderPanel();

    const row = screen.getByRole("button", { name: "Read 2:153 and 2:45 together" });
    fireEvent.focus(row);
    expect(useCanvasStore.getState().hoveredEdgeId).toBe("e1");
    fireEvent.click(row);

    expect(useCanvasStore.getState().sidebarContent?.type).toBe("edge");
    expect(useCanvasStore.getState().hoveredEdgeId).toBeNull();
  });

  it("drops the canvas hover when keyboard focus leaves a row", () => {
    openNode("a");
    renderPanel();

    const row = screen.getByRole("button", { name: "Read 2:153 and 2:45 together" });
    fireEvent.focus(row);
    fireEvent.blur(row);
    expect(useCanvasStore.getState().hoveredEdgeId).toBeNull();
  });

  it("puts the other end first when the pair is opened from that verse", () => {
    openEdge("e1", "b");
    renderPanel();

    precedes(screen.getByText(V45.translation), screen.getByText(V153.translation));
    expect(screen.getByRole("button", { name: "All connections of 2:45" })).toBeInTheDocument();
  });

  it("opens each new view at the top instead of the old scroll position", () => {
    openNode("a");
    renderPanel();
    // The scroll container is keyed by what it shows, so it is a fresh element
    // (scrolled to the top) for every pair.
    const threadScroller = screen.getByRole("tablist").parentElement!;

    fireEvent.click(screen.getByRole("button", { name: "Read 2:153 and 2:45 together" }));
    const pairScroller = screen.getByText(V45.translation).closest(".overflow-y-auto")!;
    expect(threadScroller.isConnected).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Next 8:46" }));
    expect(pairScroller.isConnected).toBe(false);
  });

  it("steps through connections with the arrow keys, the pager and the bottom buttons", () => {
    openEdge("e1", "a");
    renderPanel();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText(V846.translation)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous connection" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    const next = screen.getByRole("button", { name: "Next 8:46" });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(next);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("keeps Previous / Next inside the kind filter the reader chose", () => {
    act(() => useCanvasStore.setState({ edges: [...THEME_EDGES, ROOT_EDGE] as never }));
    openNode("a");
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Theme 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Read 2:153 and 2:45 together" }));

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next connection" }));
    expect(screen.getByText(V846.translation)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next connection" })).toBeDisabled();
  });

  it("goes back to the list with the row you came from in view and focused", () => {
    openNode("a");
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Read 2:153 and 8:46 together" }));

    fireEvent.click(screen.getByRole("button", { name: "All connections of 2:153" }));

    expect(useCanvasStore.getState().sidebarContent).toEqual({ type: "node", nodeId: "a" });
    const back = screen.getByRole("button", { name: "Read 2:153 and 8:46 together" });
    expect(back).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("moves between tabs with the arrow keys and loads tafsir once", async () => {
    openNode("a");
    renderPanel();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Connections 2" }), { key: "ArrowRight" });
    const tafsir = screen.getByRole("tab", { name: "Tafsir" });
    expect(tafsir).toHaveAttribute("aria-selected", "true");
    expect(tafsir).toHaveFocus();
    expect(screen.getByText("Ibn Kathir")).toBeInTheDocument();
    expect(await screen.findByText("Tafsir unavailable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Connections 2" }));
    fireEvent.click(tafsir);
    const tafsirCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith("/tafsir"));
    expect(tafsirCalls).toHaveLength(1);
  });

  it("closes when the card it shows leaves the canvas", () => {
    openNode("b");
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
