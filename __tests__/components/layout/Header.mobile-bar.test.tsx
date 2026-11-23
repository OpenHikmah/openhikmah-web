import { screen, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/canvas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { mockBuildShareUrl, mockSignIn } = vi.hoisted(() => ({
  mockBuildShareUrl: vi.fn(),
  mockSignIn: vi.fn(),
}));
vi.mock("@/hooks/useCanvasPersistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useCanvasPersistence")>()),
  buildShareUrl: mockBuildShareUrl,
}));
vi.mock("@/hooks/useSignIn", () => ({
  useSignIn: () => ({ signIn: mockSignIn, signingIn: false }),
}));

import { Header } from "@/components/layout/Header";
import { useAuthStore } from "@/store/auth";
import { useCanvasStore } from "@/store/canvas";
import * as canvasExport from "@/lib/canvas/canvas-export";
import type { Verse } from "@/types/quran";

const baseVerse: Verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

beforeEach(() => {
  useCanvasStore.getState().reset();
  useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
});

describe("Header mobile bar — export-failed vs. clear icon", () => {
  it("uses a distinct icon for the export-failed indicator, not the same one as Clear", async () => {
    vi.spyOn(canvasExport, "exportCanvasToPng").mockRejectedValue(new Error("export failed"));

    renderWithIntl(<Header onSearchOpen={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as PNG" }));

    const failedButton = await screen.findByRole("button", { name: "Failed" });
    const clearButton = screen.getByRole("button", { name: "Clear" });

    const failedIconSvg = failedButton.querySelector("svg")?.innerHTML;
    const clearIconSvg = clearButton.querySelector("svg")?.innerHTML;

    expect(failedIconSvg).toBeTruthy();
    expect(clearIconSvg).toBeTruthy();
    expect(failedIconSvg).not.toBe(clearIconSvg);
  });
});

describe("Header mobile bar — Clear requires confirmation", () => {
  it("requires a second click before clearing the canvas", () => {
    renderWithIntl(<Header onSearchOpen={() => {}} />);

    const clearButton = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearButton);
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Confirm clear?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm clear?" }));
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });
});

describe("Header mobile bar — share feedback (issue #755)", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    mockBuildShareUrl.mockReset();
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("shows a failed state and logs when building the share link fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockBuildShareUrl.mockRejectedValue(new Error("share api down"));

    renderWithIntl(<Header onSearchOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByRole("button", { name: "Failed" })).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith("Header: share failed", expect.any(Error));
    errorSpy.mockRestore();
  });

  it("shows a failed state when the clipboard write is blocked", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockBuildShareUrl.mockResolvedValue("https://openhikmah.com/canvas?share=abc");
    writeText.mockRejectedValue(new Error("NotAllowedError"));

    renderWithIntl(<Header onSearchOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByRole("button", { name: "Failed" })).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("shows the copied state, not an error, when sharing succeeds", async () => {
    mockBuildShareUrl.mockResolvedValue("https://openhikmah.com/canvas?share=abc");
    writeText.mockResolvedValue(undefined);

    renderWithIntl(<Header onSearchOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Failed" })).not.toBeInTheDocument();
  });
});

describe("Header mobile bar — signed-out Save (issue #755)", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    useAuthStore.setState({ accessToken: null });
  });

  it("offers sign-in instead of omitting Save when signed out", () => {
    renderWithIntl(<Header onSearchOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(screen.queryByRole("button", { name: "Save workspace" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to save" }));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it("shows Save, not sign-in, when signed in", () => {
    useAuthStore.setState({ accessToken: "tok" });
    renderWithIntl(<Header onSearchOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(screen.getByRole("button", { name: "Save workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in to save" })).not.toBeInTheDocument();
  });
});
