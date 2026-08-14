import { screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

import { ContextSidebar } from "@/components/layout/ContextSidebar";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import type { Verse } from "@/types/quran";

const baseVerse: Verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  // Full verse text + en.sahih (Saheeh International, alquran.cloud) translation — Al-Baqarah 2:255.
  arabicText:
    "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ",
  translation:
    "Allah - there is no deity except Him, the Ever-Living, the Self-Sustaining. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth. Who is it that can intercede with Him except by His permission? He knows what is before them and what will be after them, and they encompass not a thing of His knowledge except for what He wills. His Kursi extends over the heavens and the earth, and their preservation tires Him not. And He is the Most High, the Most Great.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

describe("ContextSidebar — notes textarea accessibility", () => {
  const mockFetch = vi.fn();
  const previousAuth = useAuthStore.getState();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    useAuthStore.setState({ accessToken: "test-token" });
    useCanvasStore.getState().setSidebarContent({ type: "node", verse: baseVerse });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuth);
    useCanvasStore.getState().setSidebarContent(null);
  });

  it("gives the notes textarea a programmatic accessible name", async () => {
    await act(async () => {
      renderWithIntl(<ContextSidebar />);
    });

    fireEvent.click(screen.getByRole("button", { name: "My Notes" }));

    expect(await screen.findByRole("textbox", { name: /add a private note/i })).toBeInTheDocument();
  });
});

describe("ContextSidebar — note delete checks response status", () => {
  const mockFetch = vi.fn();
  const previousAuth = useAuthStore.getState();
  const note = { id: 1, note: "a private note", createdAt: new Date().toISOString() };
  let deleteResponse: () => Promise<Response> = async () => new Response(null, { status: 204 });

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    deleteResponse = async () => new Response(null, { status: 204 });
    // Method-aware (rather than call-order-aware) so React 18's double-invoked
    // effect in test mode doesn't consume the DELETE mock as the notes GET.
    mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? deleteResponse()
        : Promise.resolve(new Response(JSON.stringify([note]), { status: 200 }))
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    useAuthStore.setState({ accessToken: "test-token" });
    useCanvasStore.getState().setSidebarContent({ type: "node", verse: baseVerse });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuth);
    useCanvasStore.getState().setSidebarContent(null);
  });

  it("removes the note from state when the DELETE response is ok", async () => {
    await act(async () => {
      renderWithIntl(<ContextSidebar />);
    });
    fireEvent.click(screen.getByRole("button", { name: "My Notes" }));
    expect(await screen.findByText("a private note")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    });

    expect(screen.queryByText("a private note")).not.toBeInTheDocument();
  });

  it("keeps the note in state and surfaces an error when the DELETE response is not ok", async () => {
    deleteResponse = async () => new Response(null, { status: 500 });

    await act(async () => {
      renderWithIntl(<ContextSidebar />);
    });
    fireEvent.click(screen.getByRole("button", { name: "My Notes" }));
    expect(await screen.findByText("a private note")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    });

    expect(screen.getByText("a private note")).toBeInTheDocument();
    expect(await screen.findByText("Delete failed")).toBeInTheDocument();
  });

  it("keeps the note in state and surfaces an error when the DELETE request rejects", async () => {
    deleteResponse = () => Promise.reject(new Error("network down"));

    await act(async () => {
      renderWithIntl(<ContextSidebar />);
    });
    fireEvent.click(screen.getByRole("button", { name: "My Notes" }));
    expect(await screen.findByText("a private note")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    });

    expect(screen.getByText("a private note")).toBeInTheDocument();
    expect(await screen.findByText("Delete failed")).toBeInTheDocument();
  });
});
