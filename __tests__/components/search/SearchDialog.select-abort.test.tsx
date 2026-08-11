import { useState } from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import type { Verse, SearchResult, SearchResponse } from "@/types/quran";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { useCanvasStore } from "@/store/canvas";
import { SearchDialog } from "@/components/search/SearchDialog";

// en.sahih (Saheeh International, alquran.cloud) — Al-Baqarah 2:1-2.
const VERSE_TEXT: Record<string, { arabic: string; translation: string }> = {
  "2:1": { arabic: "الم", translation: "Alif, Lam, Meem." },
  "2:2": {
    arabic: "ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ",
    translation:
      "This is the Book about which there is no doubt, a guidance for those conscious of Allah -",
  },
};

function makeResult(ref: string, surahName: string): SearchResult {
  const text = VERSE_TEXT[ref];
  return {
    ref: ref as SearchResult["ref"],
    surahName,
    surahNameArabic: "سورة البقرة",
    snippet: text.translation,
    arabicText: text.arabic,
    translation: text.translation,
  };
}

function makeVerse(ref: string): Verse {
  const [s, a] = ref.split(":");
  const text = VERSE_TEXT[ref];
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: text.arabic,
    translation: text.translation,
    surahName: "Al-Baqarah",
    surahNameArabic: "سورة البقرة",
  };
}

function DialogHarness() {
  const [open, setOpen] = useState(true);
  return <SearchDialog open={open} onClose={() => setOpen(false)} />;
}

describe("SearchDialog — result-select fetch aborted on close", () => {
  const results = [makeResult("2:1", "Al-Baqarah"), makeResult("2:2", "Al-Baqarah")];

  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not add a canvas node if the dialog closes before the selected result's fetch resolves", async () => {
    // Simulates the network genuinely completing sometime after the user acts —
    // whether that "arrival" wins the race against an abort depends on whether
    // the fetch call was wired with the AbortSignal (the fix under test).
    const settle: { withVerse: (() => void) | null } = { withVerse: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/search")) {
          const body: SearchResponse = { results, total: results.length, page: 1, pageSize: 10 };
          return { ok: true, json: async () => body, headers: new Headers() } as Response;
        }
        if (url.startsWith("/api/verse/2/1")) {
          const signal = init?.signal;
          return new Promise<Response>((resolve, reject) => {
            settle.withVerse = () =>
              resolve({ ok: true, json: async () => makeVerse("2:1") } as Response);
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      })
    );

    renderWithIntl(<DialogHarness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "guidance" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2), { timeout: 2000 });

    fireEvent.click(screen.getAllByRole("option")[0]);

    // Confirm the verse request actually started before we close the dialog —
    // otherwise the test below would pass vacuously.
    await waitFor(() => expect(settle.withVerse).not.toBeNull());

    // Close the dialog (Escape) before the /api/verse fetch resolves.
    fireEvent.keyDown(document, { key: "Escape" });

    // The network request "arrives" only now — after the close. With the fix,
    // it was already aborted (rejected) by this point, so this is a no-op.
    settle.withVerse!();
    await new Promise((r) => setTimeout(r, 0));

    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it("does not add a canvas node if the parent flips `open` to false directly before the selected result's fetch resolves", async () => {
    // Distinct from the Escape-key case above: here the parent sets `open={false}`
    // directly — not Escape, not the overlay, not the dialog's X button — the
    // case the shared cancelAndReset effect (keyed on the `open` prop) exists for.
    const settle: { withVerse: (() => void) | null } = { withVerse: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/search")) {
          const body: SearchResponse = { results, total: results.length, page: 1, pageSize: 10 };
          return { ok: true, json: async () => body, headers: new Headers() } as Response;
        }
        if (url.startsWith("/api/verse/2/1")) {
          const signal = init?.signal;
          return new Promise<Response>((resolve, reject) => {
            settle.withVerse = () =>
              resolve({ ok: true, json: async () => makeVerse("2:1") } as Response);
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      })
    );

    const onClose = vi.fn();
    const { rerender } = renderWithIntl(<SearchDialog open onClose={onClose} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "guidance" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2), { timeout: 2000 });

    fireEvent.click(screen.getAllByRole("option")[0]);
    await waitFor(() => expect(settle.withVerse).not.toBeNull());

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <SearchDialog open={false} onClose={onClose} />
      </NextIntlClientProvider>
    );

    settle.withVerse!();
    await new Promise((r) => setTimeout(r, 0));

    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });
});
