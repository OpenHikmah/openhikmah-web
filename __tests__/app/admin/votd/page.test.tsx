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

const verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

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
