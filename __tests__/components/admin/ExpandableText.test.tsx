import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { ExpandableText } from "@/components/admin/ExpandableText";

/**
 * jsdom has no layout engine, so scrollHeight/clientHeight are always 0. Stub
 * them to simulate a clamped element that does (or doesn't) overflow.
 */
function stubOverflow(overflowing: boolean) {
  const scroll = vi
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(overflowing ? 200 : 40);
  const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
  return () => {
    scroll.mockRestore();
    client.mockRestore();
  };
}

afterEach(() => vi.restoreAllMocks());

describe("ExpandableText", () => {
  it("renders the text with no toggle when it fits", () => {
    const restore = stubOverflow(false);
    render(<ExpandableText>short reason</ExpandableText>);
    expect(screen.getByText("short reason")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    restore();
  });

  it("shows a Show more toggle when the text overflows, and flips it on click", () => {
    const restore = stubOverflow(true);
    render(<ExpandableText>a very long reason that would wrap several times</ExpandableText>);

    const toggle = screen.getByRole("button", { name: "Show more" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getByRole("button", { name: "Show more" })).toBeInTheDocument();
    restore();
  });
});
