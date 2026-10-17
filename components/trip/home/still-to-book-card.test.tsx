import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Route } from "next";
import { StillToBookCard } from "./still-to-book-card";
import type { StillToBookRow } from "@/lib/still-to-book";

const row = (id: string, kind: StillToBookRow["kind"] = "TRANSPORT"): StillToBookRow => ({
  id, kind, title: `Thing ${id}`, subtitle: "Book by Sat 1 May", href: `/trips/x/day/2027-06-0${id}` as Route, bookBy: "2027-05-01",
});

describe("StillToBookCard (Home, spec R2)", () => {
  it("lists each thing as a link to it, with how many there are", () => {
    render(<StillToBookCard rows={[row("1"), row("2", "ITEM")]} limit={5} planHref={"/trips/x/plan" as Route} />);
    expect(screen.getByRole("heading", { name: /still to book/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /thing 1/i })).toHaveAttribute("href", "/trips/x/day/2027-06-01");
    expect(screen.getByText("2")).toBeInTheDocument();
    // The row's name carries when to book it, and the count is spoken in the heading.
    expect(screen.getByRole("link", { name: /thing 1/i })).toHaveAccessibleName(/Thing 1\s*Book by Sat 1 May/);
    expect(screen.getByRole("heading", { name: /^Still to book\s*, 2$/ })).toBeInTheDocument();
  });
  it("caps the rows and links the rest to the Plan", () => {
    render(<StillToBookCard rows={["1", "2", "3"].map((i) => row(i))} limit={2} planHref={"/trips/x/plan" as Route} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /1 more to book/i })).toHaveAttribute("href", "/trips/x/plan");
  });
  it("renders nothing when everything is booked", () => {
    const { container } = render(<StillToBookCard rows={[]} limit={5} planHref={"/trips/x/plan" as Route} />);
    expect(container).toBeEmptyDOMElement();
  });
});
