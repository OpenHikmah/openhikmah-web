import { screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { SearchModeToggle } from "@/components/search/SearchModeToggle";

describe("SearchModeToggle", () => {
  it("renders translated labels and calls onChange", () => {
    const onChange = vi.fn();
    renderWithIntl(<SearchModeToggle mode="keyword" onChange={onChange} />);

    expect(screen.getByText("Keyword")).toBeInTheDocument();
    expect(screen.getByText("By meaning")).toBeInTheDocument();

    fireEvent.click(screen.getByText("By meaning"));
    expect(onChange).toHaveBeenCalledWith("meaning");
  });

  it("hides the semantic hint in keyword mode", () => {
    renderWithIntl(<SearchModeToggle mode="keyword" onChange={vi.fn()} />);
    expect(screen.queryByText(/finds related ideas/)).not.toBeInTheDocument();
  });

  it("shows the semantic hint in meaning mode", () => {
    renderWithIntl(<SearchModeToggle mode="meaning" onChange={vi.fn()} />);
    expect(screen.getByText(/finds related ideas/)).toBeInTheDocument();
  });
});
