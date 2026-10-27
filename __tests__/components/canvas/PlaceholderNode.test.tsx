import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
}));

import { PlaceholderNode } from "@/components/canvas/PlaceholderNode";
import { PLACEHOLDER_HEIGHT } from "@/lib/canvas/canvas-layout";

describe("PlaceholderNode", () => {
  it("is hidden from assistive tech and as tall as the layout assumes", () => {
    const { container } = render(<PlaceholderNode />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.getAttribute("aria-hidden")).toBe("true");
    expect(card.style.height).toBe(`${PLACEHOLDER_HEIGHT}px`);
  });

  it("is as wide as a verse card (w-72), so the column layout leaves it the right room", () => {
    const { container } = render(<PlaceholderNode />);
    expect((container.firstElementChild as HTMLElement).classList.contains("w-72")).toBe(true);
  });

  it("shows no verse text, only pulsing placeholder bars", () => {
    const { container } = render(<PlaceholderNode />);
    expect(container.textContent).toBe("");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
