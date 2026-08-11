import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { CanvasTour } from "@/components/canvas/CanvasTour";

beforeEach(() => {
  localStorage.clear();
});

describe("CanvasTour", () => {
  it("focuses the primary action (not the dismiss button) when it appears", async () => {
    renderWithIntl(<CanvasTour />);
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Next" })).toBe(document.activeElement);
    });
  });

  it("traps Tab within the card, wrapping from the last control back to the first", async () => {
    renderWithIntl(<CanvasTour />);
    const primary = await screen.findByRole("button", { name: "Next" });
    const dismiss = screen.getByRole("button", { name: "Dismiss tour" });

    await act(async () => {
      primary.focus();
    });
    fireEvent.keyDown(primary, { key: "Tab" });
    expect(document.activeElement).toBe(dismiss);

    fireEvent.keyDown(dismiss, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(primary);
  });

  it("returns focus to the pre-tour active element once dismissed", async () => {
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    await act(async () => {
      outside.focus();
    });

    renderWithIntl(<CanvasTour />);
    await screen.findByRole("button", { name: "Next" });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss tour" }));

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(outside);
    });

    document.body.removeChild(outside);
  });

  it("positions in the top-right on desktop, not bottom-left where the canvas legend sits", async () => {
    renderWithIntl(<CanvasTour />);
    const dialog = await screen.findByRole("dialog");
    const container = dialog.parentElement;

    expect(container?.className).toMatch(/md:right-6/);
    expect(container?.className).toMatch(/md:top-6/);
    expect(container?.className).not.toMatch(/md:bottom-6/);
    expect(container?.className).not.toMatch(/md:left-6/);
  });
});
