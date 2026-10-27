import { useState } from "react";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { describe, expect, it, vi } from "vitest";
import { ExpandMenu, placeMenu } from "@/components/canvas/ExpandMenu";

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        Expand connections
      </button>
      {open && <ExpandMenu verseRef="2:153" onSelect={vi.fn()} onClose={() => setOpen(false)} />}
    </div>
  );
}

describe("ExpandMenu", () => {
  it("traps Tab within the three options, wrapping last to first and first to last", async () => {
    renderWithIntl(<Harness />);
    const options = screen.getAllByRole("menuitem");
    expect(options).toHaveLength(3);
    const [first, , last] = options;

    await act(async () => {
      last.focus();
    });
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("focuses the first option on open", () => {
    renderWithIntl(<Harness />);
    const options = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(options[0]);
  });

  it("returns focus to the trigger when the menu closes", async () => {
    renderWithIntl(<Harness initialOpen={false} />);
    const trigger = screen.getByTestId("trigger");
    await act(async () => {
      trigger.focus();
    });
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);

    fireEvent.keyDown(document, { key: "Escape" });

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("names the verse and lists the three kinds without counts", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(<ExpandMenu verseRef="2:153" onSelect={onSelect} onClose={onClose} />);

    const menu = screen.getByRole("menu", { name: "Find linked verses" });
    expect(menu).toHaveTextContent("2:153");
    expect(menu).not.toHaveTextContent(/found/i);
    expect(screen.getAllByRole("menuitem").map((b) => b.textContent)).toEqual([
      "◈By themeSame theological meaning",
      "عBy root wordShared Arabic root",
      "↔By contrastOpposing concept",
    ]);

    fireEvent.click(screen.getAllByRole("menuitem")[1]);
    expect(onSelect).toHaveBeenCalledWith("root");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("placeMenu", () => {
  // A 1000×600 canvas; the menu is 256×220 at zoom 1.
  const bounds = { top: 0, left: 0, right: 1000, bottom: 600 };
  const menu = { width: 256, height: 220 };
  const card = (left: number, top: number) => ({ left, top, right: left + 260, bottom: top + 140 });

  it("opens on the right, where new verses appear, when there is room", () => {
    expect(placeMenu(card(100, 100), menu, bounds, 1)).toEqual({ side: "right", shiftUp: 0 });
  });

  it("opens on the left when the card is near the canvas's right edge", () => {
    expect(placeMenu(card(700, 100), menu, bounds, 1).side).toBe("left");
  });

  it("keeps the side with more room when neither side fits", () => {
    const narrow = { ...bounds, right: 400 };
    expect(placeMenu(card(120, 100), menu, narrow, 1).side).toBe("left");
    expect(placeMenu(card(20, 100), menu, narrow, 1).side).toBe("right");
  });

  it("moves up when it would run off the bottom, in the card's unzoomed pixels", () => {
    // Bottom would be 500 + 220 = 720, 128px past 592 (600 minus the 8px margin).
    expect(placeMenu(card(100, 500), menu, bounds, 1).shiftUp).toBe(128);
    expect(placeMenu(card(100, 500), menu, bounds, 2).shiftUp).toBe(64);
  });

  it("never moves above the top of the canvas", () => {
    const short = { ...bounds, bottom: 200 };
    expect(placeMenu(card(100, 50), menu, short, 1).shiftUp).toBe(42);
  });
});
