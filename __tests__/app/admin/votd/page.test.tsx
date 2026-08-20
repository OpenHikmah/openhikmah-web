import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return {
    ...actual,
    useAdminFetch: () => mockApi,
  };
});

import VotdPage from "@/app/admin/votd/page";

// en.sahih (Saheeh International, alquran.cloud) — Al-Baqarah 2:255.
const verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

describe("VotdPage — today's live pick on the calendar", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockApi.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows today's algorithmic pick as a ref on today's calendar cell, with no separate header section", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayDay = String(new Date().getUTCDate());
    mockApi.mockResolvedValue({
      entries: [],
      today: {
        date: todayIso,
        ref: "1:1",
        arabicText: "بِسْمِ اللَّهِ",
        translation: "In the name of Allah",
        reflection: null,
        source: "algorithmic",
      },
    });

    render(<VotdPage />);

    const todayCell = (await screen.findByText(todayDay, { selector: "span.tabular-nums" }))
      .closest("button")!;
    expect(await screen.findByText("1:1")).toBeInTheDocument();
    expect(todayCell).toContainElement(screen.getByText("1:1"));
    expect(screen.queryByRole("button", { name: "Edit today" })).not.toBeInTheDocument();
    expect(screen.queryByText("In the name of Allah")).not.toBeInTheDocument();
  });

  it("shows the curated ref (not the algorithmic pick) on today's cell once a day is curated", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayDay = String(new Date().getUTCDate());
    mockApi.mockResolvedValue({
      entries: [{ date: todayIso, verseRef: "2:255", reflection: null, updatedAt: "" }],
      today: {
        date: todayIso,
        ref: "2:255",
        arabicText: "اللَّهُ لَا إِلَٰهَ",
        translation: "Allah — no deity",
        reflection: "A short reflection.",
        source: "curated",
      },
    });

    render(<VotdPage />);

    const todayCell = (await screen.findByText(todayDay, { selector: "span.tabular-nums" }))
      .closest("button")!;
    expect(todayCell).toContainElement(screen.getByText("2:255"));
    expect(screen.queryByText("A short reflection.")).not.toBeInTheDocument();
  });

  it("clicking today's cell pre-fills the verse-reference field with today's live pick when nothing is curated yet", async () => {
    // Matches VotdPage's own `todayStr()` computation, so `today` is recognized
    // as actually being today without needing to fake the clock.
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayDay = String(new Date().getUTCDate());
    mockApi.mockResolvedValue({
      entries: [],
      today: {
        date: todayIso,
        ref: "18:10",
        arabicText: "بِسْمِ اللَّهِ",
        translation: "In the name of Allah",
        reflection: null,
        source: "algorithmic",
      },
    });

    render(<VotdPage />);
    fireEvent.click(await screen.findByText(todayDay, { selector: "span.tabular-nums" }));

    const input = await screen.findByPlaceholderText("e.g. 2:255");
    expect(input).toHaveValue("18:10");
  });

  it("syncs the pre-filled ref once today resolves, even if the day was selected first", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayDay = String(new Date().getUTCDate());
    const pending = deferred<{
      entries: unknown[];
      today: { date: string; ref: string; source: string } | null;
    }>();
    mockApi.mockReturnValue(pending.promise);

    render(<VotdPage />);

    // Select today's cell before the calendar/today fetch has resolved.
    fireEvent.click(screen.getByText(todayDay, { selector: "span.tabular-nums" }));
    const input = await screen.findByPlaceholderText("e.g. 2:255");
    expect(input).toHaveValue("");

    pending.resolve({
      entries: [],
      today: {
        date: todayIso,
        ref: "18:10",
        arabicText: "بِسْمِ اللَّهِ",
        translation: "In the name of Allah",
        reflection: null,
        source: "algorithmic",
      } as never,
    });

    await waitFor(() => expect(input).toHaveValue("18:10"));
  });

  it("does not overwrite an already-edited field once today resolves late", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayDay = String(new Date().getUTCDate());
    const pending = deferred<{
      entries: unknown[];
      today: { date: string; ref: string; source: string } | null;
    }>();
    mockApi.mockReturnValue(pending.promise);

    render(<VotdPage />);

    fireEvent.click(screen.getByText(todayDay, { selector: "span.tabular-nums" }));
    const input = await screen.findByPlaceholderText("e.g. 2:255");
    fireEvent.change(input, { target: { value: "2:255" } });

    pending.resolve({
      entries: [],
      today: {
        date: todayIso,
        ref: "18:10",
        arabicText: "بِسْمِ اللَّهِ",
        translation: "In the name of Allah",
        reflection: null,
        source: "algorithmic",
      } as never,
    });

    await waitFor(() => expect(screen.getByText("18:10")).toBeInTheDocument());
    expect(input).toHaveValue("2:255");
  });

  it("renders normally, with no error, when today could not be resolved", async () => {
    const todayDay = String(new Date().getUTCDate());
    mockApi.mockResolvedValue({ entries: [], today: null });

    render(<VotdPage />);

    expect(await screen.findByText(todayDay, { selector: "span.tabular-nums" })).toBeInTheDocument();
  });
});

describe("VotdPage — Preview button guards against overlapping requests", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockApi.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    mockApi.mockResolvedValue({ entries: [] }); // calendar load for any month
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables Preview while a request is in flight and ignores a stale second click's response", async () => {
    render(<VotdPage />);

    fireEvent.click(screen.getByText("1", { selector: "span.tabular-nums" }));

    const verseInput = await screen.findByPlaceholderText("e.g. 2:255");
    fireEvent.change(verseInput, { target: { value: "2:255" } });

    const first = deferred<Response>();
    mockFetch.mockReturnValueOnce(first.promise);

    const previewButton = screen.getByRole("button", { name: "Preview" });
    fireEvent.click(previewButton);

    expect(previewButton).toBeDisabled();

    // A second click while the first request is in flight must not fire another fetch.
    fireEvent.click(previewButton);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    first.resolve(new Response(JSON.stringify(verse), { status: 200 }));
    await waitFor(() => expect(previewButton).not.toBeDisabled());
    expect(await screen.findByText(verse.translation)).toBeInTheDocument();
  });
});
