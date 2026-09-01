import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SectionHeading } from "@/components/admin/SectionHeading";

describe("SectionHeading", () => {
  it("renders the title as an h2 with the subtitle and actions", () => {
    render(
      <SectionHeading title="By model" subtitle="Last 30 days" actions={<button>Refresh</button>} />
    );
    const heading = screen.getByRole("heading", { level: 2, name: "By model" });
    expect(heading).toHaveClass("font-semibold");
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
