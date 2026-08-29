import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Table, Th } from "@/components/admin/primitives";

describe("Th", () => {
  it("defaults to scope=col so screen readers associate the column", () => {
    const { container } = render(
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
          </tr>
        </thead>
      </Table>
    );
    expect(container.querySelector("th")).toHaveAttribute("scope", "col");
  });

  it("allows overriding scope (e.g. row headers)", () => {
    const { container } = render(
      <Table>
        <thead>
          <tr>
            <Th scope="row">Name</Th>
          </tr>
        </thead>
      </Table>
    );
    expect(container.querySelector("th")).toHaveAttribute("scope", "row");
  });
});
