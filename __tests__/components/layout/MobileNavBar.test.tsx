import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileNavBar } from "@/components/layout/MobileNavBar";

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: mockUsePathname }));

const { mockMobileNavVisible } = vi.hoisted(() => ({ mockMobileNavVisible: vi.fn() }));
vi.mock("@/hooks/useMobileNavVisible", () => ({
  useMobileNavVisible: mockMobileNavVisible,
}));

describe("MobileNavBar", () => {
  it("renders the tab bar when the shared hook reports visible", () => {
    mockUsePathname.mockReturnValue("/search");
    mockMobileNavVisible.mockReturnValue(true);
    render(<MobileNavBar />);
    expect(screen.getByRole("link", { name: /Search/i })).toBeInTheDocument();
  });

  it("renders nothing when the shared hook reports hidden", () => {
    mockUsePathname.mockReturnValue("/canvas");
    mockMobileNavVisible.mockReturnValue(false);
    const { container } = render(<MobileNavBar />);
    expect(container).toBeEmptyDOMElement();
  });
});
