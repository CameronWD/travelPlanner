import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { MarkerList } from "./marker-list";
import { MarkerFilters } from "./marker-filters";
import type { MarkerView } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mkMarker = (overrides: Partial<MarkerView> & { id: string; title: string }): MarkerView => ({
  category: "SIGHTSEEING",
  note: null,
  link: null,
  timing: null,
  lat: null,
  lng: null,
  city: null,
  country: null,
  countryCode: null,
  ...overrides,
});

const markers: MarkerView[] = [
  mkMarker({ id: "1", title: "Eiffel Tower", city: "Paris", country: "France", category: "SIGHTSEEING" }),
  mkMarker({ id: "2", title: "Louvre", city: "Paris", country: "France", category: "ACTIVITY" }),
  mkMarker({ id: "3", title: "Fushimi Inari", city: "Kyoto", country: "Japan", category: "SIGHTSEEING" }),
];

// Default no-op props for tests that don't care about the new callbacks
const noop = vi.fn();
const defaultListProps = { selectedId: null as string | null, onSelect: noop, onEdit: noop, onDelete: noop };

// ---------------------------------------------------------------------------
// MarkerList
// ---------------------------------------------------------------------------

describe("MarkerList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders country group headers and one row per marker", () => {
    render(<MarkerList markers={markers} {...defaultListProps} />);

    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    expect(screen.getByText("Fushimi Inari")).toBeInTheDocument();
  });

  it("clicking a row calls onSelect with the marker id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MarkerList markers={markers} {...defaultListProps} onSelect={onSelect} />);

    await user.click(screen.getByText("Louvre"));
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("shows the empty state when markers is empty", () => {
    render(<MarkerList markers={[]} {...defaultListProps} />);
    expect(screen.getByText(/no markers yet/i)).toBeInTheDocument();
  });

  it("selects on row click, and edit/delete are separate buttons", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(), onEdit = vi.fn(), onDelete = vi.fn();
    const singleMarker = [mkMarker({ id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING" })];
    render(
      <MarkerList
        markers={singleMarker as never}
        selectedId={null}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    // Row click → select, NOT edit
    // The row button's accessible name is "Tokyo Tower <subtitle>" (not "Edit Tokyo Tower")
    const rowButton = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("Tokyo Tower") && !b.getAttribute("aria-label"),
    );
    expect(rowButton).toBeDefined();
    await user.click(rowButton!);
    expect(onSelect).toHaveBeenCalledWith("m1");
    expect(onEdit).not.toHaveBeenCalled();

    // Edit button → onEdit
    await user.click(screen.getByRole("button", { name: /edit tokyo tower/i }));
    expect(onEdit).toHaveBeenCalledWith("m1");
  });

  it("applies aria-current to the selected row", () => {
    const singleMarker = [mkMarker({ id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING" })];
    render(
      <MarkerList
        markers={singleMarker as never}
        selectedId="m1"
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const rowButton = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("Tokyo Tower") && !b.getAttribute("aria-label"),
    );
    expect(rowButton).toBeDefined();
    expect(rowButton).toHaveAttribute("aria-current", "true");
  });
});

// ---------------------------------------------------------------------------
// MarkerFilters
// ---------------------------------------------------------------------------

describe("MarkerFilters", () => {
  const defaultFilter = { category: null, country: null, query: "" };
  const countries = ["France", "Japan"];

  beforeEach(() => vi.clearAllMocks());

  it("changing the category select calls onChange with the new category", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={defaultFilter} countries={countries} onChange={onChange} />,
    );

    const selects = screen.getAllByRole("combobox");
    const categorySelect = selects[0];
    await user.selectOptions(categorySelect, "ACTIVITY");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ category: "ACTIVITY" }),
    );
  });

  it("typing in the query input calls onChange with the query string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={defaultFilter} countries={countries} onChange={onChange} />,
    );

    const queryInput = screen.getByPlaceholderText(/filter your markers/i);
    await user.type(queryInput, "e");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ query: "e" }),
    );
  });

  it("changing the country select calls onChange with the new country", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={defaultFilter} countries={countries} onChange={onChange} />,
    );

    const selects = screen.getAllByRole("combobox");
    const countrySelect = selects[1];
    await user.selectOptions(countrySelect, "Japan");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ country: "Japan" }),
    );
  });
});
