import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { EmptyState } from "@/components/canvas/EmptyState";

describe("EmptyState journey chips", () => {
  it("renders translated journey labels, not hardcoded English", () => {
    renderWithIntl(<EmptyState onSearchOpen={vi.fn()} />, "tr");

    expect(screen.getByRole("link", { name: "Sabır" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rahmet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nur" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Şükür" })).toBeInTheDocument();
    expect(screen.queryByText("Patience")).not.toBeInTheDocument();
  });

  it("renders English journey labels by default", () => {
    renderWithIntl(<EmptyState onSearchOpen={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Patience" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mercy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gratitude" })).toBeInTheDocument();
  });
});
