import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeaderNavLinks } from "@/components/layout/HeaderNavLinks";

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: mockUsePathname }));

describe("HeaderNavLinks", () => {
  it("renders all 5 desktop items including Bookmarks", () => {
    mockUsePathname.mockReturnValue("/search");
    render(<HeaderNavLinks />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: /Bookmarks/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Stories/i })).toBeInTheDocument();
  });
});
