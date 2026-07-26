import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MiniPlayer } from "@/components/audio/MiniPlayer";
import { useAudioStore } from "@/store/audio";

const { mockMobileNavVisible } = vi.hoisted(() => ({ mockMobileNavVisible: vi.fn() }));
vi.mock("@/hooks/useMobileNavVisible", () => ({
  useMobileNavVisible: mockMobileNavVisible,
}));

function seedPlaying() {
  useAudioStore.setState({
    currentRef: "2:255",
    currentSurahName: "Al-Baqarah",
    isPlaying: true,
    isLoading: false,
    queue: [{ ref: "2:255" }] as never,
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
    const { container } = render(<MiniPlayer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offsets above the mobile nav bar when it's visible", () => {
    seedPlaying();
    mockMobileNavVisible.mockReturnValue(true);
    render(<MiniPlayer />);
    expect(screen.getByText("2:255").closest("div.fixed")).toHaveClass(
      "max-md:bottom-[calc(58px+env(safe-area-inset-bottom)+16px)]"
    );
  });

  it("uses the default offset when the mobile nav bar is hidden", () => {
    seedPlaying();
    mockMobileNavVisible.mockReturnValue(false);
    render(<MiniPlayer />);
    const el = screen.getByText("2:255").closest("div.fixed");
    expect(el).toHaveClass("bottom-4");
    expect(el).not.toHaveClass("max-md:bottom-[calc(58px+env(safe-area-inset-bottom)+16px)]");
  });
});
