import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Field } from "@/components/admin/Field";
import { Input, Select } from "@/components/ui";
import { formatTimestamp } from "@/lib/admin/format";

describe("probe", () => {
  it("Field + Input accessible name", () => {
    render(<Field label="Budget" hint="USD, per run."><Input /></Field>);
    const el = screen.getByRole("textbox");
    console.log("INPUT ACCNAME:", JSON.stringify(el.getAttribute("aria-label")), el.labels?.[0]?.textContent);
    expect(true).toBe(true);
  });
  it("Field + Select accessible name", () => {
    render(<Field label="Model"><Select value="a" onValueChange={() => {}} options={[{value:"a",label:"A"}]} /></Field>);
    const el = screen.getByRole("combobox");
    console.log("SELECT OUTER HTML:", el.outerHTML.slice(0, 300));
    expect(true).toBe(true);
  });
  it("timestamp", () => {
    console.log("TS:", formatTimestamp("2026-01-02T15:04:00Z"));
    console.log("TS-INVALID:", formatTimestamp("not-a-date"));
    console.log("TZ:", Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
