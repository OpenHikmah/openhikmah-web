import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthLoadingSkeleton } from "@/components/home/AuthLoadingSkeleton";

describe("AuthLoadingSkeleton", () => {
  it("keeps the home page heading available while auth restores", () => {
    render(<AuthLoadingSkeleton />);

    expect(screen.getByRole("heading", { level: 1, name: "Open Hikmah home" })).toBeInTheDocument();
  });
});
