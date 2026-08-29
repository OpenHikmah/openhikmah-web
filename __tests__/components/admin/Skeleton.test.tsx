import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SkeletonRows } from "@/components/admin/Skeleton";

describe("SkeletonRows", () => {
  it("exposes a single screen-reader status and hides the bars from AT", () => {
    const { container } = render(<SkeletonRows n={4} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("renders n placeholder bars", () => {
    const { container } = render(<SkeletonRows n={7} />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(7);
  });

  it("defaults to 6 bars", () => {
    const { container } = render(<SkeletonRows />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
  });
});
