import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MiniPlayer } from "@/components/audio/MiniPlayer";
import { useAudioStore, type AudioVerse } from "@/store/audio";
import { renderWithIntl } from "../../test-utils/render-with-intl";

const { mockMobileNavVisible } = vi.hoisted(() => ({ mockMobileNavVisible: vi.fn() }));
vi.mock("@/hooks/useMobileNavVisible", () => ({
  useMobileNavVisible: mockMobileNavVisible,
}));

const verse: AudioVerse = { ref: "2:255", surah: 2, ayah: 255, surahName: "Al-Baqarah" };

function seedPlaying() {
  useAudioStore.setState({
    currentRef: verse.ref,
    currentSurahName: verse.surahName,
    isPlaying: true,
    isLoading: false,
    queue: [verse],
    queueIndex: 0,
  });
}

describe("MiniPlayer", () => {
  beforeEach(() => {
    mockMobileNavVisible.mockReset();
  });

  it("renders nothing when nothing is playing", () => {
    useAudioStore.setState({ currentRef: null });
    mockMobileNavVisible.mockReturnValue(false);
    const { container } = renderWithIntl(<MiniPlayer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offsets above the mobile nav bar when it's visible", () => {
    seedPlaying();
    mockMobileNavVisible.mockReturnValue(true);
    renderWithIntl(<MiniPlayer />);
    expect(screen.getByText("2:255").closest("div.fixed")).toHaveClass(
      "max-md:bottom-[calc(58px+env(safe-area-inset-bottom)+16px)]"
    );
  });

  it("uses the default offset when the mobile nav bar is hidden", () => {
    seedPlaying();
    mockMobileNavVisible.mockReturnValue(false);
    renderWithIntl(<MiniPlayer />);
    const el = screen.getByText("2:255").closest("div.fixed");
    expect(el).toHaveClass("bottom-4");
    expect(el).not.toHaveClass("max-md:bottom-[calc(58px+env(safe-area-inset-bottom)+16px)]");
  });

  it("labels its controls in the active locale", () => {
    seedPlaying();
    useAudioStore.setState({
      queue: [verse, { ...verse, ref: "2:256", ayah: 256 }, { ...verse, ref: "2:257", ayah: 257 }],
      queueIndex: 1,
    });
    mockMobileNavVisible.mockReturnValue(false);
    renderWithIntl(<MiniPlayer />, "tr");
    expect(screen.getByRole("button", { name: "Önceki ayet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duraklat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sonraki ayet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oynatmayı durdur" })).toBeInTheDocument();
  });

  describe("Space key", () => {
    const pause = vi.fn();
    const resume = vi.fn();

    beforeEach(() => {
      pause.mockReset();
      resume.mockReset();
      mockMobileNavVisible.mockReturnValue(false);
    });

    it("pauses while playing", () => {
      seedPlaying();
      useAudioStore.setState({ pause, resume });
      renderWithIntl(<MiniPlayer />);
      fireEvent.keyDown(document.body, { code: "Space", key: " " });
      expect(pause).toHaveBeenCalledOnce();
      expect(resume).not.toHaveBeenCalled();
    });

    it("resumes while paused", () => {
      seedPlaying();
      useAudioStore.setState({ isPlaying: false, pause, resume });
      renderWithIntl(<MiniPlayer />);
      fireEvent.keyDown(document.body, { code: "Space", key: " " });
      expect(resume).toHaveBeenCalledOnce();
      expect(pause).not.toHaveBeenCalled();
    });

    it("ignores Space typed into an input", () => {
      seedPlaying();
      useAudioStore.setState({ pause, resume });
      renderWithIntl(
        <>
          <input aria-label="search" />
          <MiniPlayer />
        </>
      );
      fireEvent.keyDown(screen.getByLabelText("search"), { code: "Space", key: " " });
      expect(pause).not.toHaveBeenCalled();
    });

    it("does nothing when no track is loaded", () => {
      useAudioStore.setState({ currentRef: null, pause, resume });
      renderWithIntl(<MiniPlayer />);
      fireEvent.keyDown(document.body, { code: "Space", key: " " });
      expect(pause).not.toHaveBeenCalled();
      expect(resume).not.toHaveBeenCalled();
    });
  });
});
