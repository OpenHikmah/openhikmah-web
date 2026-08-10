import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { HeaderNavLinks } from "@/components/layout/HeaderNavLinks";
import { renderWithIntl } from "../../test-utils/render-with-intl";

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: mockUsePathname }));

describe("HeaderNavLinks", () => {
  it("renders all 5 desktop items including Saved", () => {
    mockUsePathname.mockReturnValue("/search");
    renderWithIntl(<HeaderNavLinks />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: /Saved/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Narratives/i })).toBeInTheDocument();
  });
});
