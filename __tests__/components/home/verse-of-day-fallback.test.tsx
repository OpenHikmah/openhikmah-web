import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonalHome } from "@/components/home/PersonalHome";
import { MarketingHero } from "@/components/home/MarketingHero";

describe("Verse of the Day — failed-load fallback", () => {
  it("PersonalHome shows a visible message instead of silently omitting the card", () => {
    render(<PersonalHome verse={null} />);

    expect(
      screen.getByText(/couldn't load today's verse right now\. please try again later\./i)
    ).toBeInTheDocument();
  });

  it("MarketingHero shows a visible message instead of silently omitting the strip", () => {
    render(<MarketingHero verse={null} />);

    expect(screen.getByText(/couldn't load today's verse right now\./i)).toBeInTheDocument();
  });
});
