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

    const todayCell = (
      await screen.findByText(todayDay, { selector: "span.tabular-nums" })
    ).closest("button")!;
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

    const todayCell = (
      await screen.findByText(todayDay, { selector: "span.tabular-nums" })
    ).closest("button")!;
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

    expect(
      await screen.findByText(todayDay, { selector: "span.tabular-nums" })
    ).toBeInTheDocument();
  });
});

describe("VotdPage — calendar keyboard navigation", () => {
  // Pin the clock to a mid-month date so the navigation math never wraps a month
  // boundary — otherwise these tests silently self-skip near month end.
  const FIXED = new Date("2026-06-17T12:00:00Z");
  const todayDay = FIXED.getUTCDate();
  const weekday = FIXED.getUTCDay();

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED);
    mockApi.mockReset();
    mockApi.mockResolvedValue({ entries: [], today: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const cell = (day: number) =>
    screen.getByText(String(day), { selector: "span.tabular-nums" }).closest("button")!;
  // aria-selected lives on the gridcell wrapping the day button (APG grid pattern).
  const gridcell = (day: number) => cell(day).closest('[role="gridcell"]')!;

  it("labels each day and makes today's cell the tab-reachable one (roving tabindex)", async () => {
    render(<VotdPage />);
    await screen.findByText("1", { selector: "span.tabular-nums" });

    expect(cell(todayDay)).toHaveAttribute("tabindex", "0");
    expect(cell(todayDay === 1 ? 2 : 1)).toHaveAttribute("tabindex", "-1");
    expect(cell(1).getAttribute("aria-label")).toMatch(/no verse set/);
  });

  it("ArrowRight moves the selection one day and ArrowDown moves a week", async () => {
    render(<VotdPage />);
    await screen.findByText("1", { selector: "span.tabular-nums" });

    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(gridcell(todayDay + 1)).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(gridcell(todayDay + 8)).toHaveAttribute("aria-selected", "true");
  });

  it("Home and End move to the bounds of the active week", async () => {
    render(<VotdPage />);
    await screen.findByText("1", { selector: "span.tabular-nums" });
    const grid = screen.getByRole("grid");

    fireEvent.keyDown(grid, { key: "Home" });
    expect(gridcell(todayDay - weekday)).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(grid, { key: "End" });
    expect(gridcell(todayDay + (6 - weekday))).toHaveAttribute("aria-selected", "true");
  });

  it("PageDown moves to the next month, keeping the day of the month", async () => {
    render(<VotdPage />);
    await screen.findByText("1", { selector: "span.tabular-nums" });

    const monthNow = FIXED.toLocaleString("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "PageDown" });

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(monthNow)
    );
    const nextMonth = addMonthStr(FIXED.toISOString().slice(0, 7), 1);
    const nextMonthDays = new Date(
      Date.UTC(Number(nextMonth.slice(0, 4)), Number(nextMonth.slice(5, 7)), 0)
    ).getUTCDate();
    const expectedDom = Math.min(todayDay, nextMonthDays);
    await waitFor(() => expect(gridcell(expectedDom)).toHaveAttribute("aria-selected", "true"));
  });
});

function addMonthStr(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

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
