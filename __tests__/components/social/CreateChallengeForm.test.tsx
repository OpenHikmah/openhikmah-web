import { screen } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { describe, expect, it } from "vitest";
import { CreateChallengeForm } from "@/components/social/CreateChallengeForm";

const friends = [
  { id: 1, username: "alice" },
  { id: 2, username: "bob" },
];

describe("CreateChallengeForm — friend select accessible label", () => {
  it("gives the friend select a programmatic accessible name in the full layout", () => {
    renderWithIntl(<CreateChallengeForm friends={friends} onCreated={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Choose a friend" })).toBeInTheDocument();
  });

  it("gives the friend select a programmatic accessible name in the compact layout", () => {
    renderWithIntl(<CreateChallengeForm friends={friends} onCreated={() => {}} compact />);
    expect(screen.getByRole("combobox", { name: "Choose a friend" })).toBeInTheDocument();
  });
});
