import { fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { TooltipProvider } from "@/components/ui";
import { usePreferencesStore } from "@/store/preferences";
import { DownloadAudioButton } from "@/components/audio/DownloadAudioButton";

function renderButton() {
  return renderWithIntl(
    <TooltipProvider>
      <DownloadAudioButton surah={2} ayah={255} />
    </TooltipProvider>
  );
}

describe("DownloadAudioButton", () => {
  beforeEach(() => {
    usePreferencesStore.setState({ reciter: "ar.husary" });
  });

  it("navigates a same-origin link to the route with the selected reciter, no blob", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: /download recitation/i }));

    expect(click).toHaveBeenCalledTimes(1);
    const clicked = click.mock.contexts[0] as HTMLAnchorElement;
    expect(clicked.getAttribute("href")).toBe("/api/audio/2/255?reciter=ar.husary");
    expect(clicked.hasAttribute("download")).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Download started");
    click.mockRestore();
  });
});
