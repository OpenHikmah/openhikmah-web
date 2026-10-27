import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

import { AdminShell, AdminPageHeader } from "@/components/admin/AdminShell";
import { AdminContext } from "@/components/admin/AdminContext";

function renderShell() {
  return render(
    <AdminContext.Provider value={{ adminQfId: "qf-1", username: "operator" }}>
      <AdminShell>
        <div>work area</div>
      </AdminShell>
    </AdminContext.Provider>
  );
}

describe("AdminShell — responsive mobile layout", () => {
  it("hides the persistent sidebar off-screen on mobile and shows a hamburger trigger instead", () => {
    renderShell();

    const aside = document.querySelector("aside");
    expect(aside).toHaveClass("hidden");

    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("opens an off-canvas drawer with the nav when the hamburger is pressed, and closes on Escape", () => {
    renderShell();

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
    // The desktop aside's own "Overview" link plus the drawer's — the drawer
    // duplicates the same nav content rather than moving it.
    expect(screen.getAllByRole("link", { name: /Overview/ }).length).toBe(2);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
  });

  it("closes on an outside click, but not on a click on the hamburger trigger itself", () => {
    renderShell();

    const trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();

    // A mousedown on the trigger (e.g. re-clicking it to close) must not be
    // treated as an "outside" click — that raced with the trigger's own click
    // toggle in a past bug (MoreSheet, commit d8ea69e) and reopened the panel.
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
  });
});

describe("AdminShell — navigation structure", () => {
  it("groups the modules under section headings", () => {
    renderShell();
    const nav = screen.getAllByRole("navigation", { name: "Admin" })[0];
    for (const heading of ["Insight", "Content", "People", "Operations"]) {
      expect(nav).toHaveTextContent(heading);
    }
    expect(within(nav).getAllByRole("link")).toHaveLength(15);
  });

  it("marks only the current module with aria-current", () => {
    renderShell();
    const current = screen
      .getAllByRole("link", { current: "page" })
      .map((el) => el.textContent?.trim());
    expect(current).toEqual(["Overview"]);
  });

  it("shows the current page title in the mobile bar", () => {
    renderShell();
    const bar = screen.getByRole("button", { name: "Open menu" }).parentElement!;
    expect(bar).toHaveTextContent("Overview");
  });

  it("exposes the drawer as a modal dialog controlled by the hamburger, and locks body scroll", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Admin navigation" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("AdminPageHeader", () => {
  it("sets a per-page document title", () => {
    render(<AdminPageHeader title="Users" />);
    expect(document.title).toBe("Users — Admin — Open Hikmah");
  });

  it("renders its actions", () => {
    render(<AdminPageHeader title="Users" actions={<button>Refresh</button>} />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});

describe("AdminShell — drawer across the sm breakpoint", () => {
  it("closes the drawer and releases the scroll lock when the layout becomes desktop", () => {
    let listener: ((e: MediaQueryListEvent) => void) | undefined;
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => (listener = cb),
      removeEventListener: () => (listener = undefined),
    })) as unknown as typeof window.matchMedia;

    try {
      renderShell();
      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
      expect(document.body.style.overflow).toBe("hidden");

      act(() => listener?.({ matches: true } as MediaQueryListEvent));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.body.style.overflow).not.toBe("hidden");
    } finally {
      window.matchMedia = original;
    }
  });
});
