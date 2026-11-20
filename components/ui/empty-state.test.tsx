import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("balances its title and description so a short line does not leave one word alone", () => {
    render(<EmptyState title="Nothing here yet" description="Add the first thing and it will show up here." />);
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toHaveClass("text-balance");
    expect(screen.getByText("Add the first thing and it will show up here.")).toHaveClass("text-balance");
  });
});
